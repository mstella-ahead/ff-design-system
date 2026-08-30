/**
 * validate-tokens.ts — lightweight sanity check for tokens/ (no network).
 *
 * Verifies every emitted token file is valid JSON, every leaf token (anything
 * with a $value) carries a $type, and every alias reference ({group.token})
 * resolves to a real token. Used by CI and runnable locally:
 *
 *   npx tsx scripts/validate-tokens.ts
 */

import { promises as fs } from 'fs';
import * as path from 'path';

const TOKENS_DIR = path.resolve('tokens');
const FILES = ['color.json', 'typography.json', 'spacing.json', 'radius.json', 'shadow.json'];

type Json = { [k: string]: unknown };

function isObject(v: unknown): v is Json {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Collect every token path (a node carrying $value) and every alias reference. */
function walk(node: Json, trail: string[], tokens: Set<string>, aliases: Array<{ at: string; ref: string }>, errors: string[]): void {
  if ('$value' in node) {
    const at = trail.join('.');
    tokens.add(at);
    if (!('$type' in node)) errors.push(`${at}: token has $value but no $type`);
    const value = node['$value'];
    if (typeof value === 'string') {
      const m = value.match(/^\{([^}]+)\}$/);
      if (m && m[1]) aliases.push({ at, ref: m[1] });
    }
    return;
  }
  for (const [k, v] of Object.entries(node)) {
    if (k.startsWith('$')) continue; // $description etc.
    if (isObject(v)) walk(v, [...trail, k], tokens, aliases, errors);
  }
}

async function main(): Promise<void> {
  const errors: string[] = [];
  const tokens = new Set<string>();
  const aliases: Array<{ at: string; ref: string }> = [];

  for (const file of FILES) {
    const p = path.join(TOKENS_DIR, file);
    let raw: string;
    try { raw = await fs.readFile(p, 'utf8'); }
    catch { errors.push(`${file}: missing`); continue; }
    let json: unknown;
    try { json = JSON.parse(raw); }
    catch (e) { errors.push(`${file}: invalid JSON — ${(e as Error).message}`); continue; }
    if (isObject(json)) walk(json, [path.basename(file, '.json')], tokens, aliases, errors);
  }

  // Aliases reference paths like "color.blue.500" — our token paths are prefixed
  // by the filename (e.g. "color.color.blue.500" would be wrong); normalize by
  // checking the alias against token paths with the leading file segment dropped.
  const tokenLeaves = new Set([...tokens].map((t) => t.split('.').slice(1).join('.')));
  for (const { at, ref } of aliases) {
    if (!tokenLeaves.has(ref)) errors.push(`${at}: alias {${ref}} does not resolve to a known token`);
  }

  if (errors.length) {
    console.error(`✗ token validation failed (${errors.length}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`✓ tokens valid — ${tokens.size} tokens across ${FILES.length} files, ${aliases.length} alias(es) resolve.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
