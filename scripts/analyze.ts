/**
 * analyze.ts — Stage 2 of the FormFactor design-system extraction pipeline.
 *
 * Reads the RAW artifacts under ./raw/ (no network) and distills them into a
 * versioned design system under ./tokens/:
 *   - color.json       perceptually-clustered palette (W3C Design Tokens)
 *   - typography.json  font families, size + weight + line-height scales, text styles
 *   - spacing.json     margin/padding/gap scale (+ long-tail flagged in the report)
 *   - radius.json      distinct border-radius values
 *   - shadow.json      distinct box-shadow values
 *   - REPORT.md        human-readable summary: histogram, scales, dominant-vs-drift
 *
 * Computed styles are ground truth (see CLAUDE.md). Unlike many sites, the
 * formfactor-2022 WordPress theme DOES publish authored :root custom properties
 * (--primary, --secondary, --size-*, ...). Those authored names beat anything we
 * auto-generate: prefer them when naming tokens, and use the clustered computed
 * colors to confirm which are actually load-bearing vs declared-but-unused.
 *
 *   npx tsx scripts/analyze.ts
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { parse, formatHex, converter, differenceCiede2000, type Color } from 'culori';

// --- Config ---------------------------------------------------------------

const RAW_DIR = path.resolve('raw');
const TOKENS_DIR = path.resolve('tokens');
const VENDOR = 'com.formfactor.www'; // namespace for $extensions metadata

// CIEDE2000 ΔE below which two colors are treated as the same token. ~1 is
// imperceptible; we use a small value so only genuine drift collapses.
const COLOR_DELTA = Number(process.env.ANALYZE_COLOR_DELTA ?? 2.0);
// A color must appear at least this many times to seed the palette (filters
// one-off noise). Rare colors still show in the report's drift section.
const COLOR_MIN_COUNT = Number(process.env.ANALYZE_COLOR_MIN_COUNT ?? 2);
// Brand marks: any cluster within a small ΔE of one of these is tagged as brand.
// Sourced from the theme's own :root vars (--primary / --secondary) in
// wp-content/themes/formfactor-2022/style.css. Override with FF_BRAND_HEXES.
const BRAND_HEXES = (process.env.FF_BRAND_HEXES ?? '#003a63,#00a0af')
  .split(',').map((h) => h.trim().toLowerCase()).filter(Boolean);
/** True if `hex` is one of the configured brand colors (exact match). */
function isBrand(hex: string | null | undefined): boolean {
  return Boolean(hex) && BRAND_HEXES.includes(hex!.toLowerCase());
}

const toOklch = converter('oklch');
const ciede = differenceCiede2000();

// --- Raw model ------------------------------------------------------------

interface RawElement {
  tag: string;
  classes: string;
  path: string;
  rect: { x: number; y: number; w: number; h: number };
  styles: Record<string, string>;
}

interface PageRaw {
  slug: string;
  elements: RawElement[];
  cssVars: Record<string, string>;
}

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readJson<T>(p: string): Promise<T> {
  return JSON.parse(await fs.readFile(p, 'utf8')) as T;
}

async function readRaw(): Promise<PageRaw[]> {
  if (!(await fileExists(RAW_DIR))) {
    throw new Error(`No ${RAW_DIR}/ — run scripts/crawl.ts first.`);
  }
  const entries = await fs.readdir(RAW_DIR, { withFileTypes: true });
  const pages: PageRaw[] = [];
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(RAW_DIR, ent.name);
    const stylesPath = path.join(dir, 'computed-styles.json');
    if (!(await fileExists(stylesPath))) continue;
    const elements = await readJson<RawElement[]>(stylesPath);
    const varsPath = path.join(dir, 'css-variables.json');
    const cssVars = (await fileExists(varsPath)) ? await readJson<Record<string, string>>(varsPath) : {};
    pages.push({ slug: ent.name, elements, cssVars });
  }
  pages.sort((a, b) => a.slug.localeCompare(b.slug));
  return pages;
}

// --- Small utilities ------------------------------------------------------

function inc<K>(map: Map<K, number>, key: K, by = 1): void {
  map.set(key, (map.get(key) ?? 0) + by);
}

function pxOf(value: string): number | null {
  const v = value.trim();
  if (!v.endsWith('px')) return null;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function sortedByCountDesc<K>(map: Map<K, number>): Array<[K, number]> {
  return [...map.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
}

// ==========================================================================
// COLORS
// ==========================================================================

interface ColorStat { hex: string; count: number; roles: { text: number; bg: number; border: number }; pages: Set<string>; }
interface ColorCluster { rep: ColorStat; repColor: Color; members: ColorStat[]; count: number; pages: Set<string>; roles: { text: number; bg: number; border: number }; name: string; brand: boolean; }

function normalizeColor(raw: string): string | null {
  const v = raw.trim();
  if (!v || v === 'transparent' || v === 'none') return null;
  const c = parse(v);
  if (!c) return null;
  if (typeof c.alpha === 'number' && c.alpha === 0) return null; // fully transparent
  return formatHex(c) ?? null;
}

function collectColors(pages: PageRaw[]): Map<string, ColorStat> {
  const stats = new Map<string, ColorStat>();
  const bump = (hex: string, role: 'text' | 'bg' | 'border', slug: string): void => {
    let s = stats.get(hex);
    if (!s) { s = { hex, count: 0, roles: { text: 0, bg: 0, border: 0 }, pages: new Set() }; stats.set(hex, s); }
    s.count++; s.roles[role]++; s.pages.add(slug);
  };
  for (const page of pages) {
    for (const el of page.elements) {
      const st = el.styles;
      const text = normalizeColor(st['color'] ?? '');
      if (text) bump(text, 'text', page.slug);
      const bg = normalizeColor(st['background-color'] ?? '');
      if (bg) bump(bg, 'bg', page.slug);
      // Border colors only count when there's an actual (top) border — otherwise
      // every element reports its default border color and floods the palette.
      const bw = pxOf(st['border-top-width'] ?? '');
      if (bw && bw > 0) {
        for (const side of ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color']) {
          const bc = normalizeColor(st[side] ?? '');
          if (bc) bump(bc, 'border', page.slug);
        }
      }
    }
  }
  return stats;
}

function clusterColors(stats: Map<string, ColorStat>): { clusters: ColorCluster[]; tail: ColorStat[] } {
  const all = [...stats.values()].sort((a, b) => b.count - a.count || a.hex.localeCompare(b.hex));
  const seeds = all.filter((s) => s.count >= COLOR_MIN_COUNT);
  const tail = all.filter((s) => s.count < COLOR_MIN_COUNT);

  const clusters: ColorCluster[] = [];
  for (const s of seeds) {
    const color = parse(s.hex);
    if (!color) continue;
    let best: ColorCluster | null = null;
    let bestD = Infinity;
    for (const cl of clusters) {
      const d = ciede(color, cl.repColor);
      if (d <= COLOR_DELTA && d < bestD) { best = cl; bestD = d; }
    }
    if (best) {
      best.members.push(s);
      best.count += s.count;
      s.pages.forEach((p) => best!.pages.add(p));
      best.roles.text += s.roles.text; best.roles.bg += s.roles.bg; best.roles.border += s.roles.border;
    } else {
      clusters.push({
        rep: s, repColor: color, members: [s], count: s.count,
        pages: new Set(s.pages), roles: { ...s.roles }, name: '', brand: false,
      });
    }
  }
  clusters.sort((a, b) => b.count - a.count || a.rep.hex.localeCompare(b.rep.hex));
  nameClusters(clusters);
  return { clusters, tail };
}

function hueFamily(c: Color): string {
  const o = toOklch(c);
  const chroma = o.c ?? 0;
  if (chroma < 0.04) return 'neutral';
  const h = ((o.h ?? 0) % 360 + 360) % 360;
  if (h < 20 || h >= 350) return 'red';
  if (h < 55) return 'orange';
  if (h < 95) return 'yellow';
  if (h < 165) return 'green';
  if (h < 210) return 'teal';
  if (h < 265) return 'blue';
  if (h < 295) return 'indigo';
  if (h < 330) return 'purple';
  return 'pink';
}

function lightnessStep(c: Color): string {
  const l = toOklch(c).l ?? 0;
  const buckets: Array<[number, string]> = [
    [0.97, '50'], [0.92, '100'], [0.85, '200'], [0.77, '300'], [0.68, '400'],
    [0.58, '500'], [0.49, '600'], [0.40, '700'], [0.30, '800'], [0.18, '900'], [0, '950'],
  ];
  for (const [min, step] of buckets) if (l >= min) return step;
  return '950';
}

function nameClusters(clusters: ColorCluster[]): void {
  const brandColors = BRAND_HEXES.map((h) => parse(h)).filter((c): c is Color => Boolean(c));
  const used = new Set<string>();
  for (const cl of clusters) {
    if (cl.rep.hex === '#ffffff') cl.name = 'neutral-white';
    else if (cl.rep.hex === '#000000') cl.name = 'neutral-black';
    else cl.name = `${hueFamily(cl.repColor)}-${lightnessStep(cl.repColor)}`;
    let name = cl.name, n = 2;
    while (used.has(name)) name = `${cl.name}-${n++}`;
    cl.name = name; used.add(name);
    if (brandColors.some((bc) => ciede(cl.repColor, bc) <= 5)) cl.brand = true;
  }
}

function buildColorTokens(clusters: ColorCluster[]): unknown {
  const families: Record<string, Record<string, unknown>> = {};
  let brandToken: string | null = null;

  for (const cl of clusters) {
    const [family, ...rest] = cl.name.split('-');
    const step = rest.join('-');
    const fam = family ?? 'neutral';
    // Core = used across the site (≥3 pages); extended = accent colors confined
    // to one or two page templates. This is the dominant-vs-drift split.
    const tier = cl.pages.size >= 3 ? 'core' : 'extended';
    (families[fam] ??= {})[step] = {
      $value: cl.rep.hex,
      $type: 'color',
      ...(cl.brand ? { $description: 'FormFactor brand color' } : {}),
      $extensions: {
        [VENDOR]: {
          tier,
          count: cl.count,
          roles: cl.roles,
          oklch: roundOklch(cl.repColor),
          clusterMembers: cl.members.map((m) => ({ hex: m.hex, count: m.count })),
          pages: [...cl.pages].sort(),
        },
      },
    };
    if (cl.brand && !brandToken) brandToken = `${fam}.${step}`;
  }

  const out: Record<string, unknown> = { ...families };
  if (brandToken) out['brand'] = { primary: { $value: `{color.${brandToken}}`, $type: 'color', $description: 'Alias of the FormFactor brand primary' } };
  return { color: out };
}

function roundOklch(c: Color): { l: number; c: number; h: number } {
  const o = toOklch(c);
  return { l: Number((o.l ?? 0).toFixed(3)), c: Number((o.c ?? 0).toFixed(3)), h: Number((o.h ?? 0).toFixed(1)) };
}

// ==========================================================================
// TYPOGRAPHY
// ==========================================================================

interface TypographyData {
  families: Map<string, number>;
  sizes: Map<number, number>;
  weights: Map<number, number>;
  lineHeights: Map<number, number>;
  combos: Map<string, { count: number; family: string; size: number; weight: number; lineHeight: string; letterSpacing: string; pages: Set<string> }>;
}

function collectTypography(pages: PageRaw[]): TypographyData {
  const d: TypographyData = { families: new Map(), sizes: new Map(), weights: new Map(), lineHeights: new Map(), combos: new Map() };
  for (const page of pages) {
    for (const el of page.elements) {
      const st = el.styles;
      const family = (st['font-family'] ?? '').trim();
      const size = pxOf(st['font-size'] ?? '');
      const weight = Number.parseInt(st['font-weight'] ?? '', 10);
      const lh = (st['line-height'] ?? '').trim();
      const ls = (st['letter-spacing'] ?? '').trim();
      if (family) inc(d.families, family);
      if (size) inc(d.sizes, size);
      if (Number.isFinite(weight)) inc(d.weights, weight);
      const lhPx = pxOf(lh);
      if (lhPx) inc(d.lineHeights, lhPx);
      if (family && size) {
        const key = `${family}|${size}|${weight}|${lh}|${ls}`;
        let c = d.combos.get(key);
        if (!c) { c = { count: 0, family, size, weight, lineHeight: lh, letterSpacing: ls, pages: new Set() }; d.combos.set(key, c); }
        c.count++; c.pages.add(page.slug);
      }
    }
  }
  return d;
}

const WEIGHT_NAMES: Record<number, string> = { 100: 'thin', 200: 'extralight', 300: 'light', 400: 'regular', 500: 'medium', 600: 'semibold', 700: 'bold', 800: 'extrabold', 900: 'black' };

function sizeScaleNames(sizes: number[], baseSize: number): Map<number, string> {
  const asc = [...sizes].sort((a, b) => a - b);
  const baseIdx = asc.indexOf(baseSize);
  const below = ['sm', 'xs', '2xs', '3xs'];
  const above = ['lg', 'xl', '2xl', '3xl', '4xl', '5xl', '6xl', '7xl'];
  const names = new Map<number, string>();
  asc.forEach((px, i) => {
    const delta = i - baseIdx;
    let name: string;
    if (delta === 0) name = 'base';
    else if (delta < 0) name = below[-delta - 1] ?? `size-${px}`;
    else name = above[delta - 1] ?? `size-${px}`;
    names.set(px, name);
  });
  return names;
}

function buildTypographyTokens(d: TypographyData): { tokens: unknown; baseSize: number; baseFamily: string } {
  const baseFamily = sortedByCountDesc(d.families)[0]?.[0] ?? 'sans-serif';
  const primaryName = (baseFamily.split(',')[0] ?? 'sans').replace(/["']/g, '').trim().toLowerCase().replace(/\s+/g, '-') || 'sans';

  const sizes = [...d.sizes.keys()];
  const baseSize = sortedByCountDesc(d.sizes)[0]?.[0] ?? 16;
  const sizeNames = sizeScaleNames(sizes, baseSize);

  const fontFamily: Record<string, unknown> = {
    [primaryName]: { $value: baseFamily, $type: 'fontFamily', $description: 'Primary UI font stack', $extensions: { [VENDOR]: { count: d.families.get(baseFamily) ?? 0 } } },
  };

  const fontSize: Record<string, unknown> = {};
  for (const [px, name] of [...sizeNames.entries()].sort((a, b) => a[0] - b[0])) {
    fontSize[name] = { $value: `${px}px`, $type: 'dimension', $extensions: { [VENDOR]: { count: d.sizes.get(px) ?? 0, px } } };
  }

  const fontWeight: Record<string, unknown> = {};
  for (const [w, count] of sortedByCountDesc(d.weights)) {
    const name = WEIGHT_NAMES[w] ?? `w${w}`;
    fontWeight[name] = { $value: w, $type: 'fontWeight', $extensions: { [VENDOR]: { count } } };
  }

  const lineHeight: Record<string, unknown> = {};
  [...d.lineHeights.keys()].sort((a, b) => a - b).forEach((px, i) => {
    lineHeight[`lh-${i}`] = { $value: `${px}px`, $type: 'dimension', $extensions: { [VENDOR]: { count: d.lineHeights.get(px) ?? 0, px } } };
  });

  // Composite text styles — the most common (family, size, weight, lh) combos.
  const topCombos = [...d.combos.values()].sort((a, b) => b.count - a.count).slice(0, 10);
  const textStyle: Record<string, unknown> = {};
  topCombos.forEach((c, i) => {
    const sizeName = sizeNames.get(c.size) ?? `size-${c.size}`;
    const weightName = WEIGHT_NAMES[c.weight] ?? `w${c.weight}`;
    const label = i === 0 ? 'body' : `${sizeName}-${weightName}`;
    let name = label, n = 2;
    while (name in textStyle) name = `${label}-${n++}`;
    textStyle[name] = {
      $type: 'typography',
      $value: {
        fontFamily: c.family,
        fontSize: `${c.size}px`,
        fontWeight: c.weight,
        lineHeight: c.lineHeight,
        letterSpacing: c.letterSpacing,
      },
      $extensions: { [VENDOR]: { count: c.count, pages: [...c.pages].sort() } },
    };
  });

  return { tokens: { fontFamily, fontSize, fontWeight, lineHeight, textStyle }, baseSize, baseFamily };
}

// ==========================================================================
// SPACING
// ==========================================================================

function collectSpacing(pages: PageRaw[]): Map<number, number> {
  const sizes = new Map<number, number>();
  const fields = ['margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'];
  for (const page of pages) {
    for (const el of page.elements) {
      for (const f of fields) {
        const px = pxOf(el.styles[f] ?? '');
        if (px !== null && px >= 0) inc(sizes, px);
      }
      const gap = (el.styles['gap'] ?? '').trim();
      if (gap && gap !== 'normal') for (const part of gap.split(/\s+/)) { const px = pxOf(part); if (px !== null && px >= 0) inc(sizes, px); }
    }
  }
  return sizes;
}

/**
 * Infer a base grid unit: the largest candidate (16/8/4/2) that a strong
 * majority of spacing observations are multiples of. Weighted by frequency so a
 * handful of off-grid component values don't break it. null = no consistent grid.
 */
function detectBase(sizes: Map<number, number>): { base: number | null; coverage: number } {
  const entries = [...sizes.entries()].filter(([px]) => px > 0);
  const total = entries.reduce((a, [, c]) => a + c, 0);
  if (total === 0) return { base: null, coverage: 0 };
  for (const u of [16, 8, 4, 2]) {
    const onGrid = entries.filter(([px]) => px % u === 0).reduce((a, [, c]) => a + c, 0);
    if (onGrid / total >= 0.7) return { base: u, coverage: onGrid / total };
  }
  return { base: null, coverage: 0 };
}

function buildSpacingTokens(sizes: Map<number, number>): { tokens: unknown; base: number | null; coverage: number; dominant: number[]; tail: number[] } {
  const entries = sortedByCountDesc(sizes);
  const total = [...sizes.values()].reduce((a, b) => a + b, 0);
  // Dominant = values that each carry at least 0.5% of all spacing observations.
  const threshold = Math.max(3, total * 0.005);
  const dominant = entries.filter(([, c]) => c >= threshold).map(([px]) => px).filter((px) => px > 0).sort((a, b) => a - b);
  const tail = entries.filter(([, c]) => c < threshold).map(([px]) => px).filter((px) => px > 0).sort((a, b) => a - b);

  const { base, coverage } = detectBase(sizes);

  const space: Record<string, unknown> = { '0': { $value: '0px', $type: 'dimension' } };
  for (const px of dominant) {
    space[String(px)] = { $value: `${px}px`, $type: 'dimension', $extensions: { [VENDOR]: { count: sizes.get(px) ?? 0, steps: base ? Number((px / base).toFixed(2)) : null } } };
  }
  return { tokens: { space }, base, coverage, dominant, tail };
}

// ==========================================================================
// RADIUS + SHADOW
// ==========================================================================

function collectRaw(pages: PageRaw[], field: string, skip: (v: string) => boolean): Map<string, number> {
  const m = new Map<string, number>();
  for (const page of pages) for (const el of page.elements) {
    const v = (el.styles[field] ?? '').trim();
    if (!v || skip(v)) continue;
    inc(m, v);
  }
  return m;
}

function buildRadiusTokens(radii: Map<string, number>): { tokens: unknown; uniform: Array<[string, number]>; compound: Array<[string, number]> } {
  // Uniform = a single radius applied to all corners (the real scale). Compound
  // = per-corner radii (e.g. a chip rounded on one side) — listed, not scaled.
  const uniform = [...radii.entries()].filter(([v]) => !v.includes(' ')).sort((a, b) => radiusPx(a[0]) - radiusPx(b[0]));
  const compound = [...radii.entries()].filter(([v]) => v.includes(' ')).sort((a, b) => b[1] - a[1]);
  const names = ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];
  const radius: Record<string, unknown> = {};
  uniform.forEach(([value, count], i) => {
    const isPill = /9999px|50%/.test(value);
    const name = isPill ? 'full' : (names[i] ?? `r-${radiusPx(value)}`);
    let key = name, n = 2; while (key in radius) key = `${name}-${n++}`;
    radius[key] = { $value: value, $type: 'dimension', $extensions: { [VENDOR]: { count } } };
  });
  return { tokens: { radius }, uniform, compound };
}

function radiusPx(v: string): number { const px = pxOf(v.split(/\s+/)[0] ?? ''); return px ?? (/(9999px|50%)/.test(v) ? 99999 : 0); }

function buildShadowTokens(shadows: Map<string, number>): { tokens: unknown; ordered: Array<[string, number]> } {
  const ordered = sortedByCountDesc(shadows);
  const names = ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];
  const shadow: Record<string, unknown> = {};
  ordered.forEach(([value, count], i) => {
    const name = names[i] ?? `shadow-${i}`;
    // NOTE: stored as the raw CSS string (not the W3C structured shadow object) —
    // box-shadow here mixes multiple layers + rgba; raw keeps it lossless.
    shadow[name] = { $value: value, $type: 'shadow', $extensions: { [VENDOR]: { count, raw: true } } };
  });
  return { tokens: { shadow }, ordered };
}

// ==========================================================================
// REPORT
// ==========================================================================

function bar(count: number, max: number, width = 24): string {
  const n = max > 0 ? Math.round((count / max) * width) : 0;
  return '█'.repeat(n) + '·'.repeat(width - n);
}

function buildReport(args: {
  pages: PageRaw[];
  clusters: ColorCluster[];
  colorTail: ColorStat[];
  totalDistinctColors: number;
  typo: { baseSize: number; baseFamily: string };
  typoData: TypographyData;
  spacing: { base: number | null; coverage: number; dominant: number[]; tail: number[] };
  radiusUniform: Array<[string, number]>;
  radiusCompound: Array<[string, number]>;
  shadow: Array<[string, number]>;
  nonFaVars: Array<[string, string]>;
}): string {
  const { pages, clusters, colorTail, totalDistinctColors, typo, typoData, spacing, radiusUniform, radiusCompound, shadow, nonFaVars } = args;
  const maxColor = clusters[0]?.count ?? 1;
  const lines: string[] = [];

  lines.push('# FormFactor tokens — analysis report', '');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Source: ${pages.length} pages under \`raw/\` (${pages.map((p) => p.slug).join(', ')})`, '');
  lines.push(`Color clustering: CIEDE2000 ΔE ≤ ${COLOR_DELTA}, seed min-count ${COLOR_MIN_COUNT}. Token names (\`family-step\`) are heuristic from oklch hue+lightness — auditable, meant to be curated.`, '');

  // Palette — split core (≥3 pages) vs extended (chart/accent, 1–2 pages).
  const core = clusters.filter((c) => c.pages.size >= 3);
  const extended = clusters.filter((c) => c.pages.size < 3);
  const colorRow = (cl: ColorCluster): string => {
    const roles = `${cl.roles.text}/${cl.roles.bg}/${cl.roles.border}`;
    const brand = cl.brand ? ' ⭐' : '';
    return `| \`${cl.name}\`${brand} | \`${cl.rep.hex}\` | ${cl.count} | ${roles} | ${cl.members.length} | ${cl.pages.size} |`;
  };

  lines.push('## Palette', '');
  lines.push(`${clusters.length} tokens clustered from ${totalDistinctColors} distinct observed colors — **${core.length} core** (used across ≥3 pages) + **${extended.length} extended** (accents confined to 1–2 page templates).`, '');
  lines.push('### Core UI palette', '', '| Token | Hex | Count | Roles (txt/bg/bdr) | Merged | Pages |', '|---|---|---:|---|---:|---:|');
  for (const cl of core) lines.push(colorRow(cl));
  lines.push('');
  lines.push('### Extended (chart / accent / one-off)', '', '| Token | Hex | Count | Roles (txt/bg/bdr) | Merged | Pages |', '|---|---|---:|---|---:|---:|');
  for (const cl of extended) lines.push(colorRow(cl));
  lines.push('');
  lines.push('### Frequency (dominant → drift)', '', '```');
  for (const cl of clusters) lines.push(`${cl.rep.hex} ${String(cl.count).padStart(5)} ${bar(cl.count, maxColor)} ${cl.name}`);
  lines.push('```', '');
  const tailMembers = clusters.reduce((a, c) => a + (c.members.length - 1), 0);
  lines.push(`**Dominant vs drift:** the ${core.length} core tokens are the real palette; the ${extended.length} extended tokens are accents confined to one or two page templates. ${tailMembers} near-duplicate shades were merged into their nearest token, and ${colorTail.length} rare one-off colors (count < ${COLOR_MIN_COUNT}) were dropped as drift.`, '');

  if (nonFaVars.length === 0) {
    lines.push('> No authored `:root` design-token CSS variables were captured (only third-party/icon vars), so the palette above is derived entirely from computed styles. This is unexpected for FormFactor — check that `wp-content/themes/formfactor-2022/style.css` was reachable during the crawl.', '');
  } else {
    lines.push('### Non-FontAwesome `:root` variables found', '', '```');
    for (const [k, v] of nonFaVars) lines.push(`${k}: ${v}`);
    lines.push('```', '');
  }

  // Typography
  lines.push('## Typography', '');
  lines.push(`Primary font: \`${typo.baseFamily}\``);
  lines.push(`Base size: **${typo.baseSize}px** (most frequent).`, '');
  lines.push('Font sizes (px → count):', '', '```');
  for (const [px, c] of [...typoData.sizes.entries()].sort((a, b) => a[0] - b[0])) lines.push(`${String(px).padStart(4)}px  ${c}`);
  lines.push('```', '');
  lines.push('Font weights (weight → count):', '', '```');
  for (const [w, c] of sortedByCountDesc(typoData.weights)) lines.push(`${w}  ${c}`);
  lines.push('```', '');

  // Spacing
  lines.push('## Spacing', '');
  if (spacing.base) lines.push(`Inferred base grid: **${spacing.base}px** (${Math.round(spacing.coverage * 100)}% of spacing values are multiples).`);
  else lines.push('Inferred base grid: **none** — no single unit covers ≥70% of values (mixed Tailwind + component-specific spacing).');
  lines.push(`Most-used values (px, by frequency): ${spacing.dominant.join(', ') || '—'}`, '');
  if (spacing.tail.length) lines.push(`Long tail (rare / off-grid, flagged): ${spacing.tail.join(', ')}`, '');

  // Radius
  lines.push('## Border radius', '');
  lines.push('Uniform scale (px → count):', '', '```');
  for (const [v, c] of radiusUniform) lines.push(`${v.padEnd(10)} ${c}`);
  lines.push('```', '');
  if (radiusCompound.length) {
    lines.push(`Compound / per-corner radii (not part of the scale): ${radiusCompound.map(([v, c]) => `${v} (${c}×)`).join('; ')}`, '');
  }

  // Shadow
  lines.push('## Shadows', '', `${shadow.length} distinct box-shadow value(s).`, '');
  for (const [v, c] of shadow) lines.push(`- (${c}×) \`${v}\``);
  lines.push('');

  return lines.join('\n');
}

// ==========================================================================
// COMPONENTS
// ==========================================================================

const COMPONENTS_DIR = path.resolve('components');

interface VariantAgg {
  count: number;
  pages: Set<string>;
  byClasses: Map<string, { count: number; page: string; rect: RawElement['rect']; styles: Record<string, string> }>;
}
interface CompAgg { count: number; pages: Set<string>; variants: Map<string, VariantAgg>; }

interface ComponentDef {
  slug: string;
  name: string;
  purpose: string;
  whenToUse: string;
  match: (el: RawElement, cls: Set<string>) => boolean;
  variant: (el: RawElement, cls: Set<string>) => string;
}

function classSet(el: RawElement): Set<string> {
  return new Set((el.classes || '').split(/\s+/).filter(Boolean));
}
function hasAnyClass(cls: Set<string>, re: RegExp): boolean {
  for (const c of cls) if (re.test(c)) return true;
  return false;
}
function bgVariant(el: RawElement): string {
  const bg = normalizeColor(el.styles['background-color'] || '');
  if (!bg) return 'ghost';
  if (isBrand(bg)) return 'primary';
  const o = toOklch(parse(bg)!);
  return (o.c ?? 0) < 0.04 ? 'neutral' : bg;
}
function truncate(s: string, n: number): string { return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// Detectors run in priority order; each element is attributed to the FIRST match
// (so a sidebar <a> counts as nav-item, not link). Signals are tag + Tailwind
// classes + computed styles + geometry — never the unstable phx-* ids.
const COMPONENT_DEFS: ComponentDef[] = [
  {
    slug: 'heading', name: 'Heading',
    purpose: 'Typographic headings that establish page and section hierarchy.',
    whenToUse: 'Use for page titles and section labels; choose the level to match the document outline, not for visual size alone.',
    match: (el) => /^h[1-6]$/.test(el.tag),
    variant: (el) => el.tag.toLowerCase(),
  },
  {
    slug: 'table', name: 'Table',
    purpose: 'Dense tabular data with a header row and many records.',
    whenToUse: 'Use for lists of records the user scans, sorts, or filters (manufacturers, employees, product series).',
    match: (el) => el.tag === 'table',
    variant: () => 'default',
  },
  {
    slug: 'input', name: 'Input',
    purpose: 'Text fields, selects, and textareas for data entry and search.',
    whenToUse: 'Use for free-text entry, search boxes, and option selection in forms and filters.',
    match: (el) => el.tag === 'input' || el.tag === 'textarea' || el.tag === 'select',
    variant: (el) => el.tag,
  },
  {
    slug: 'button', name: 'Button',
    purpose: 'Clickable controls that trigger an action.',
    whenToUse: 'Use for primary and secondary actions; reserve the brand-blue primary for the main action on a view.',
    match: (el, cls) => el.tag === 'button' || hasAnyClass(cls, /(^|[-_])btn([-_]|$)/),
    variant: (el) => bgVariant(el),
  },
  {
    slug: 'nav-item', name: 'Nav item',
    purpose: 'Links in the persistent top header / primary navigation bar.',
    whenToUse: 'Use inside the header to move between top-level sections.',
    // HEURISTIC (verify in P4): FormFactor uses a top nav bar, not a sidebar, so
    // we bound by y rather than x. Retune against raw/home/screenshot.png.
    match: (el) => el.tag === 'a' && el.rect.y < 160 && el.rect.h >= 18 && el.rect.h <= 80,
    variant: (el) => (isBrand(normalizeColor(el.styles['color'] || '')) ? 'active' : 'default'),
  },
  {
    slug: 'badge', name: 'Badge / chip',
    purpose: 'Small rounded labels for status, counts, categories, and filter pills.',
    whenToUse: 'Use for compact status indicators and filter chips — not for actions (use a Button) or long-form text.',
    match: (el, cls) => {
      const radius = radiusPx(el.styles['border-radius'] || '');
      const roundedFull = hasAnyClass(cls, /rounded-full/) || (el.rect.h > 0 && radius >= el.rect.h / 2);
      const bg = normalizeColor(el.styles['background-color'] || '');
      const bw = pxOf(el.styles['border-top-width'] || '');
      return roundedFull && el.rect.h <= 36 && el.rect.w <= 280 && (!!bg || (bw !== null && bw > 0));
    },
    variant: (el) => {
      const bg = normalizeColor(el.styles['background-color'] || '');
      if (!bg) return 'outline';
      const o = toOklch(parse(bg)!);
      return (o.c ?? 0) < 0.04 ? 'neutral' : bg;
    },
  },
  {
    slug: 'card', name: 'Card',
    purpose: 'Surface containers that group related content behind a border or shadow.',
    whenToUse: 'Use to group a coherent block of content or controls; prefer a single elevation level per view.',
    match: (el) => {
      if (el.tag !== 'div') return false;
      const radius = radiusPx(el.styles['border-radius'] || '');
      const shadow = (el.styles['box-shadow'] || 'none') !== 'none';
      const bw = pxOf(el.styles['border-top-width'] || '');
      const padT = pxOf(el.styles['padding-top'] || '');
      return (shadow || (bw !== null && bw > 0)) && radius >= 4 && el.rect.w >= 160 && el.rect.h >= 56 && padT !== null && padT > 0;
    },
    variant: (el) => ((el.styles['box-shadow'] || 'none') !== 'none' ? 'elevated' : 'bordered'),
  },
  {
    slug: 'link', name: 'Link',
    purpose: 'Inline and list text links rendered in a brand color.',
    whenToUse: 'Use for navigation within body content; use a Button for actions.',
    match: (el) => el.tag === 'a' && isBrand(normalizeColor(el.styles['color'] || '')),
    variant: () => 'default',
  },
];

function collectComponents(pages: PageRaw[]): Map<string, CompAgg> {
  const aggs = new Map<string, CompAgg>();
  for (const def of COMPONENT_DEFS) aggs.set(def.slug, { count: 0, pages: new Set(), variants: new Map() });
  for (const page of pages) {
    for (const el of page.elements) {
      const cls = classSet(el);
      for (const def of COMPONENT_DEFS) {
        if (!def.match(el, cls)) continue;
        const agg = aggs.get(def.slug)!;
        const vkey = def.variant(el, cls);
        agg.count++; agg.pages.add(page.slug);
        let v = agg.variants.get(vkey);
        if (!v) { v = { count: 0, pages: new Set(), byClasses: new Map() }; agg.variants.set(vkey, v); }
        v.count++; v.pages.add(page.slug);
        const ckey = el.classes || `(${el.tag}, no class)`;
        let cc = v.byClasses.get(ckey);
        if (!cc) { cc = { count: 0, page: page.slug, rect: el.rect, styles: el.styles }; v.byClasses.set(ckey, cc); }
        cc.count++;
        break; // first match wins
      }
    }
  }
  return aggs;
}

function tokenRef(hex: string | null, colorToToken: Map<string, string>): string {
  if (!hex) return '—';
  const name = colorToToken.get(hex);
  return name ? `\`${hex}\` (\`${name}\`)` : `\`${hex}\``;
}

function topClassesOf(v: VariantAgg): [string, VariantAgg['byClasses'] extends Map<string, infer T> ? T : never] | null {
  const sorted = [...v.byClasses.entries()].sort((a, b) => b[1].count - a[1].count);
  return sorted[0] ?? null;
}

function buildComponentMdx(def: ComponentDef, agg: CompAgg, colorToToken: Map<string, string>): string | null {
  if (agg.count === 0) return null;
  const variants = [...agg.variants.entries()].sort((a, b) => b[1].count - a[1].count);
  const lines: string[] = [];

  lines.push('---');
  lines.push(`name: ${def.name}`);
  lines.push(`component: ${def.slug}`);
  lines.push(`instances: ${agg.count}`);
  lines.push(`variants: ${agg.variants.size}`);
  lines.push(`pages: [${[...agg.pages].sort().join(', ')}]`);
  lines.push('---', '');
  lines.push(`# ${def.name}`, '');
  lines.push(def.purpose, '');
  lines.push(`**When to use:** ${def.whenToUse}`, '');
  lines.push(`Observed **${agg.count}** time(s) across **${agg.pages.size}** page(s).`, '');

  lines.push('## Variants', '');
  lines.push('| Variant | Background | Text | Radius | Count | Pages | Example classes |');
  lines.push('|---|---|---|---|---:|---:|---|');
  for (const [key, v] of variants.slice(0, 12)) {
    const top = topClassesOf(v);
    if (!top) continue;
    const [exClasses, ex] = top;
    const bg = normalizeColor(ex.styles['background-color'] || '');
    const fg = normalizeColor(ex.styles['color'] || '');
    const radius = (ex.styles['border-radius'] || '').split(' ')[0] || '—';
    lines.push(`| \`${truncate(key, 18)}\` | ${tokenRef(bg, colorToToken)} | ${tokenRef(fg, colorToToken)} | ${radius} | ${v.count} | ${v.pages.size} | \`${truncate(exClasses, 56)}\` |`);
  }
  lines.push('');

  const canonical = topClassesOf(variants[0]![1]);
  if (canonical) {
    const [classes, ex] = canonical;
    const s = ex.styles;
    lines.push('## Canonical example', '');
    lines.push(`- **Screenshot:** \`raw/${ex.page}/screenshot.png\` — region x:${ex.rect.x} y:${ex.rect.y} w:${ex.rect.w} h:${ex.rect.h}`);
    lines.push(`- **Classes:** \`${classes}\``);
    lines.push(`- **Key styles:** color ${s['color'] ?? '—'}; background ${s['background-color'] ?? '—'}; font ${s['font-size'] ?? '—'}/${s['font-weight'] ?? '—'}; padding ${s['padding-top'] ?? '—'} ${s['padding-right'] ?? '—'} ${s['padding-bottom'] ?? '—'} ${s['padding-left'] ?? '—'}; radius ${s['border-radius'] ?? '—'}`);
    lines.push('');
  }

  lines.push('## Source pages', '');
  for (const p of [...agg.pages].sort()) lines.push(`- \`raw/${p}/\``);
  lines.push('');
  return lines.join('\n');
}

async function writeComponents(pages: PageRaw[], colorToToken: Map<string, string>): Promise<{ written: string[]; skipped: string[] }> {
  await fs.mkdir(COMPONENTS_DIR, { recursive: true });
  const aggs = collectComponents(pages);
  const written: string[] = [];
  const skipped: string[] = [];

  const index: string[] = [
    '# FormFactor components', '',
    'Derived from computed styles + screenshots (P4). Each component is detected by tag + Tailwind classes + computed styles — not by the unstable `phx-*` ids. Colors are cross-linked to the tokens in `../tokens/color.json`.', '',
    '| Component | Instances | Variants | Pages |', '|---|---:|---:|---:|',
  ];
  for (const def of COMPONENT_DEFS) {
    const agg = aggs.get(def.slug)!;
    const mdx = buildComponentMdx(def, agg, colorToToken);
    if (!mdx) { skipped.push(def.slug); continue; }
    await fs.writeFile(path.join(COMPONENTS_DIR, `${def.slug}.mdx`), mdx);
    written.push(def.slug);
    index.push(`| [${def.name}](${def.slug}.mdx) | ${agg.count} | ${agg.variants.size} | ${agg.pages.size} |`);
  }
  await fs.writeFile(path.join(COMPONENTS_DIR, 'README.md'), index.join('\n') + '\n');
  return { written, skipped };
}

// --- Emit -----------------------------------------------------------------

async function writeJson(name: string, data: unknown): Promise<void> {
  await fs.writeFile(path.join(TOKENS_DIR, name), JSON.stringify(data, null, 2) + '\n');
}

// --- Main -----------------------------------------------------------------

async function main(): Promise<void> {
  const pages = await readRaw();
  if (pages.length === 0) throw new Error(`No pages with computed-styles.json under ${RAW_DIR}/.`);
  console.log(`Analyzing ${pages.length} page(s): ${pages.map((p) => p.slug).join(', ')}`);
  await fs.mkdir(TOKENS_DIR, { recursive: true });

  // Colors
  const colorStats = collectColors(pages);
  const { clusters, tail } = clusterColors(colorStats);
  await writeJson('color.json', buildColorTokens(clusters));
  console.log(`  color.json     — ${clusters.length} tokens from ${colorStats.size} distinct colors`);

  // Typography
  const typoData = collectTypography(pages);
  const { tokens: typoTokens, baseSize, baseFamily } = buildTypographyTokens(typoData);
  await writeJson('typography.json', typoTokens);
  console.log(`  typography.json — ${typoData.sizes.size} sizes, ${typoData.weights.size} weights, base ${baseSize}px`);

  // Spacing
  const spacingSizes = collectSpacing(pages);
  const { tokens: spacingTokens, base, coverage, dominant, tail: spacingTail } = buildSpacingTokens(spacingSizes);
  await writeJson('spacing.json', spacingTokens);
  console.log(`  spacing.json   — base ${base ? base + 'px' : 'none'}, ${dominant.length} steps (${spacingTail.length} tail)`);

  // Radius + shadow
  const radii = collectRaw(pages, 'border-radius', (v) => v === '0px');
  const { tokens: radiusTokens, uniform: radiusUniform, compound: radiusCompound } = buildRadiusTokens(radii);
  await writeJson('radius.json', radiusTokens);
  const shadows = collectRaw(pages, 'box-shadow', (v) => v === 'none');
  const { tokens: shadowTokens, ordered: shadowOrdered } = buildShadowTokens(shadows);
  await writeJson('shadow.json', shadowTokens);
  console.log(`  radius.json    — ${radiusUniform.length} uniform (+${radiusCompound.length} compound)`);
  console.log(`  shadow.json    — ${shadowOrdered.length} values`);

  // Non-FontAwesome :root vars (the "jackpot" check)
  const varSet = new Map<string, string>();
  for (const page of pages) for (const [k, v] of Object.entries(page.cssVars)) if (!k.startsWith('--fa')) varSet.set(k, v);
  const nonFaVars = [...varSet.entries()].sort();

  // Report
  const report = buildReport({
    pages, clusters, colorTail: tail, totalDistinctColors: colorStats.size,
    typo: { baseSize, baseFamily }, typoData,
    spacing: { base, coverage, dominant, tail: spacingTail },
    radiusUniform, radiusCompound, shadow: shadowOrdered, nonFaVars,
  });
  await fs.writeFile(path.join(TOKENS_DIR, 'REPORT.md'), report);
  console.log(`  REPORT.md      — written`);

  // Components (P4): cross-link colors back to the token names from above.
  const colorToToken = new Map<string, string>();
  for (const cl of clusters) {
    colorToToken.set(cl.rep.hex, cl.name);
    for (const m of cl.members) colorToToken.set(m.hex, cl.name);
  }
  const comp = await writeComponents(pages, colorToToken);
  console.log(`  components/     — ${comp.written.length} written (${comp.written.join(', ')})${comp.skipped.length ? `; skipped ${comp.skipped.join(', ')}` : ''}`);
  console.log('Done.');
}

main().catch((err) => { console.error(err); process.exit(1); });
