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

// Third-party :root custom properties. The formfactor-2022 theme authors its own
// vars *unprefixed* (--primary, --size-*, --border-radius, ...), so anything
// carrying one of these prefixes belongs to a plugin or page builder and must
// never be mistaken for a FormFactor token.
//
// --color-* / --clr-* (BB PowerPack) is the trap: --color-primary is #4a8eff, a
// generic Bootstrap-ish blue that is NOT FormFactor's --primary (#003A63). Any
// name-based heuristic grabs the wrong one, which is why authored names are only
// ever trusted from the unprefixed set.
const VENDOR_VAR_PREFIXES = [
  '--wp--', '--wp-',   // Gutenberg / core block defaults
  '--fa-',             // Font Awesome
  '--frm-',            // Formidable Forms
  '--ss-',             // slim-select
  '--color-', '--clr-',// BB PowerPack page builder
  '--wpdm-',           // WP Download Manager
];
function isVendorVar(name: string): boolean {
  return VENDOR_VAR_PREFIXES.some((prefix) => name.startsWith(prefix));
}

// Third-party *overlay widgets* that mount on every page and are never
// dismissed. These are not FormFactor's design language, but they are rendered,
// measurable, and (worst of all) partly themed in FormFactor's brand colors, so
// they masquerade as signal:
//
//   cky-*            CookieYes. Hides its banner on accept but leaves the
//                    preference-center modal mounted with real dimensions —
//                    1095 of 8345 elements (13.1%, ~73/page). Its own body text
//                    #212121 ranks 4th in the unfiltered palette on 885
//                    occurrences and is not a FormFactor color at all. It also
//                    themes itself in FormFactor's teal, inflating #00a0af ~52%.
//   wpdm-side-panel  WP Download Manager's slide-out panel. One hidden instance
//                    per page, styled in stock Tailwind slate (#0f172a, #1e293b,
//                    #64748b) — which otherwise enters the palette as three
//                    "core" tokens at a deceptive 15/15 page spread.
//
// Deliberately NOT filtered: `pp-*`/`fl-*` (BB PowerPack) and `frm-*`
// (Formidable). Those plugins build FormFactor's actual pages and forms, so
// their rendered output is real content, styled by the theme.
//
// Filtered here rather than in crawl.ts on purpose: the raw capture stays honest
// and the filter stays re-tunable without re-crawling.
const THIRD_PARTY_CHROME_RE = /cky|wpdm-sp|wpdm-side-panel/;
function isThirdPartyChrome(el: RawElement): boolean {
  return THIRD_PARTY_CHROME_RE.test(el.classes) || THIRD_PARTY_CHROME_RE.test(el.path);
}

// User-agent default colors. `#0000ee` is Chromium's unstyled-link blue and
// `#551a8b` its visited purple. They are observed on real FormFactor anchors
// (which makes them tempting) but they are the *absence* of a design decision,
// not one — so they are kept out of the palette and reported separately.
const UA_DEFAULT_HEXES = new Set(['#0000ee', '#551a8b']);

const toOklch = converter('oklch');
const ciede = differenceCiede2000();

// --- Raw model ------------------------------------------------------------

interface RawElement {
  tag: string;
  classes: string;
  path: string;
  rect: { x: number; y: number; w: number; h: number };
  styles: Record<string, string>;
  /** '::before' / '::after' when this entry is a generated pseudo-element. */
  pseudo?: string;
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

async function readRaw(): Promise<{ pages: PageRaw[]; droppedConsent: number; totalRead: number }> {
  if (!(await fileExists(RAW_DIR))) {
    throw new Error(`No ${RAW_DIR}/ — run scripts/crawl.ts first.`);
  }
  const entries = await fs.readdir(RAW_DIR, { withFileTypes: true });
  const pages: PageRaw[] = [];
  let droppedConsent = 0;
  let totalRead = 0;
  for (const ent of entries) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(RAW_DIR, ent.name);
    const stylesPath = path.join(dir, 'computed-styles.json');
    if (!(await fileExists(stylesPath))) continue;
    const all = await readJson<RawElement[]>(stylesPath);
    totalRead += all.length;
    // Drop the consent widget before anything measures it (see isConsentChrome).
    const elements = all.filter((el) => {
      if (!isThirdPartyChrome(el)) return true;
      droppedConsent++;
      return false;
    });
    const varsPath = path.join(dir, 'css-variables.json');
    const cssVars = (await fileExists(varsPath)) ? await readJson<Record<string, string>>(varsPath) : {};
    pages.push({ slug: ent.name, elements, cssVars });
  }
  pages.sort((a, b) => a.slug.localeCompare(b.slug));
  return { pages, droppedConsent, totalRead };
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

// --- Page-weighted tallies -------------------------------------------------

/**
 * A frequency tally that remembers which page each observation came from.
 *
 * Raw counts cannot drive dominance decisions on this site. The press-release
 * index (2206 elements) and the blog index (1983) are 50.2% of the whole crawl,
 * so an unweighted histogram describes what a press-release list item looks like
 * rather than what FormFactor looks like.
 *
 * Two weighted views fix that:
 *   - `spread`  — how many page templates the value appears on at all. Immune to
 *                 page size, and the honest answer to "is this site-wide?".
 *   - `norm`    — Σ over pages of (count on page / all observations on page), so
 *                 every page gets one vote regardless of element count. Summed
 *                 over all values this equals the page count, which makes it a
 *                 drop-in replacement for share-of-total thresholds.
 *
 * Raw `count` is still recorded and reported, so every decision stays auditable.
 */
interface Tally<K> { perKey: Map<K, Map<string, number>>; perPage: Map<string, number> }

function newTally<K>(): Tally<K> { return { perKey: new Map(), perPage: new Map() }; }

function tallyBump<K>(t: Tally<K>, key: K, slug: string, by = 1): void {
  let byPage = t.perKey.get(key);
  if (!byPage) { byPage = new Map(); t.perKey.set(key, byPage); }
  byPage.set(slug, (byPage.get(slug) ?? 0) + by);
  t.perPage.set(slug, (t.perPage.get(slug) ?? 0) + by);
}

function tallyCount<K>(t: Tally<K>, key: K): number {
  let n = 0;
  for (const c of t.perKey.get(key)?.values() ?? []) n += c;
  return n;
}

function tallySpread<K>(t: Tally<K>, key: K): number { return t.perKey.get(key)?.size ?? 0; }

function tallyNorm<K>(t: Tally<K>, key: K): number {
  let score = 0;
  for (const [slug, c] of t.perKey.get(key) ?? []) {
    const total = t.perPage.get(slug) ?? 0;
    if (total > 0) score += c / total;
  }
  return score;
}

function tallyPages<K>(t: Tally<K>, key: K): string[] {
  return [...(t.perKey.get(key)?.keys() ?? [])].sort();
}

/** Plain count map, for the places that still want a simple histogram. */
function tallyCounts<K>(t: Tally<K>): Map<K, number> {
  const m = new Map<K, number>();
  for (const k of t.perKey.keys()) m.set(k, tallyCount(t, k));
  return m;
}

/** Keys ordered by page-weighted score (desc), then raw count, then name. */
function tallyByNorm<K>(t: Tally<K>): K[] {
  return [...t.perKey.keys()].sort((a, b) =>
    tallyNorm(t, b) - tallyNorm(t, a) ||
    tallyCount(t, b) - tallyCount(t, a) ||
    String(a).localeCompare(String(b)));
}

// ==========================================================================
// COLORS
// ==========================================================================

interface ColorStat { hex: string; count: number; roles: { text: number; bg: number; border: number }; pages: Set<string>; }
interface ColorCluster {
  rep: ColorStat; repColor: Color; members: ColorStat[]; count: number;
  pages: Set<string>; roles: { text: number; bg: number; border: number };
  name: string;          // display name — authored if we have one, else generated
  generated: string;     // the oklch-derived fallback name, always recorded
  authored: string | null; // FormFactor's own var name, without the leading --
  jsonPath: string;      // where this token lives in color.json
  brand: boolean;
  /** >1 authored var collapsed into this cluster — a sign ΔE is too permissive. */
  authoredConflicts: string[];
  /** Every observation sits on a social share control — a platform color, not ours. */
  social: boolean;
  /** Every observation is on a ::before/::after — real, but invisible to a DOM walk. */
  pseudoOnly: boolean;
  norm: number;          // page-weighted score (see Tally)
}

// --- Authored theme colors -------------------------------------------------

/**
 * FormFactor's own color names, read off the theme's `:root`.
 *
 * This is the headline difference from a site that names nothing: the
 * formfactor-2022 theme publishes --primary / --secondary / --tertiary / --grey
 * etc., so we do not have to invent `blue-700`. Authored names win; the
 * generated name is kept as an alias so the clustering stays auditable.
 *
 * Only the *unprefixed* set is trusted — see VENDOR_VAR_PREFIXES for why
 * --color-primary (#4a8eff, BB PowerPack) must never win this lookup.
 */
interface AuthoredColor { name: string; hex: string; color: Color; declaredIn: number }

function collectAuthoredColors(pages: PageRaw[]): AuthoredColor[] {
  const seen = new Map<string, { hex: string; pages: number }>();
  for (const page of pages) {
    for (const [rawName, rawValue] of Object.entries(page.cssVars)) {
      if (isVendorVar(rawName)) continue;
      const hex = normalizeColor(rawValue);
      if (!hex) continue; // not a color (--size-*, --gradient, --logo-width, ...)
      const name = rawName.replace(/^--/, '');
      const prev = seen.get(name);
      if (prev) prev.pages++;
      else seen.set(name, { hex, pages: 1 });
    }
  }
  const out: AuthoredColor[] = [];
  for (const [name, { hex, pages: declaredIn }] of seen) {
    const color = parse(hex);
    if (color) out.push({ name, hex, color, declaredIn });
  }
  // Stable, readable order: brand-ish names first, then alphabetical.
  const rank = (n: string): number => {
    const order = ['primary', 'dark', 'secondary', 'secondary-light', 'tertiary', 'tertiary-dark', 'light', 'grey', 'dark-grey', 'grey-secondary'];
    const i = order.indexOf(n);
    return i === -1 ? order.length : i;
  };
  out.sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
  return out;
}

function normalizeColor(raw: string): string | null {
  const v = raw.trim();
  if (!v || v === 'transparent' || v === 'none') return null;
  const c = parse(v);
  if (!c) return null;
  if (typeof c.alpha === 'number' && c.alpha === 0) return null; // fully transparent
  return formatHex(c) ?? null;
}

interface UaDefaultStat { hex: string; count: number; pages: Set<string>; selectors: Map<string, number> }

function collectColors(pages: PageRaw[]): { stats: Map<string, ColorStat>; tally: Tally<string>; uaDefaults: Map<string, UaDefaultStat>; socialOnly: Set<string>; pseudoOnly: Set<string> } {
  const stats = new Map<string, ColorStat>();
  const tally = newTally<string>();
  const uaDefaults = new Map<string, UaDefaultStat>();
  // Social-platform brand colors (LinkedIn/X/Facebook) arrive as backgrounds on
  // share controls. They are part of the site's vocabulary but emphatically not
  // FormFactor's palette, so we track whether a color is only ever seen there.
  const socialHits = new Map<string, { social: number; total: number }>();
  // Colors that only ever ship via a ::before/::after. Worth flagging: they are
  // real and rendered, but invisible to any tool that walks the element tree, so
  // they are exactly the colors a naive extraction reports as "declared, unused".
  const pseudoHits = new Map<string, { pseudo: number; total: number }>();
  const notePseudo = (hex: string, isPseudo: boolean): void => {
    let r = pseudoHits.get(hex);
    if (!r) { r = { pseudo: 0, total: 0 }; pseudoHits.set(hex, r); }
    r.total++; if (isPseudo) r.pseudo++;
  };
  const noteSocial = (hex: string, isSocial: boolean): void => {
    let r = socialHits.get(hex);
    if (!r) { r = { social: 0, total: 0 }; socialHits.set(hex, r); }
    r.total++; if (isSocial) r.social++;
  };
  const bump = (hex: string, role: 'text' | 'bg' | 'border', slug: string): void => {
    let s = stats.get(hex);
    if (!s) { s = { hex, count: 0, roles: { text: 0, bg: 0, border: 0 }, pages: new Set() }; stats.set(hex, s); }
    s.count++; s.roles[role]++; s.pages.add(slug);
    tallyBump(tally, hex, slug);
  };
  for (const page of pages) {
    for (const el of page.elements) {
      // <html> reports the initial/UA color, inherited by everything below it.
      // It is not an authored choice, and counting it adds one phantom
      // observation of #000000 per page.
      if (el.tag === 'html') continue;
      const st = el.styles;
      const text = normalizeColor(st['color'] ?? '');
      if (text) {
        // UA defaults are the absence of a decision — recorded, not tokenized.
        if (UA_DEFAULT_HEXES.has(text)) {
          let d = uaDefaults.get(text);
          if (!d) { d = { hex: text, count: 0, pages: new Set(), selectors: new Map() }; uaDefaults.set(text, d); }
          d.count++; d.pages.add(page.slug);
          const sel = el.classes.split(/\s+/).filter(Boolean)[0] ?? `<${el.tag}>`;
          d.selectors.set(sel, (d.selectors.get(sel) ?? 0) + 1);
        } else {
          bump(text, 'text', page.slug);
          notePseudo(text, Boolean(el.pseudo));
        }
      }
      const bg = normalizeColor(st['background-color'] ?? '');
      if (bg) { bump(bg, 'bg', page.slug); noteSocial(bg, /share-link/.test(el.classes)); notePseudo(bg, Boolean(el.pseudo)); }
      // A border color only counts when THAT side has a non-zero width. Gating all
      // four on the top width (the previous behaviour) both floods the palette
      // with default colors and hides real ones: --tertiary-dark ships as a
      // border-right-color on an element whose top width is 0.
      for (const side of ['top', 'right', 'bottom', 'left']) {
        const bw = pxOf(st[`border-${side}-width`] ?? '');
        if (bw === null || bw <= 0) continue;
        const bc = normalizeColor(st[`border-${side}-color`] ?? '');
        if (bc) { bump(bc, 'border', page.slug); notePseudo(bc, Boolean(el.pseudo)); }
      }
    }
  }
  const socialOnly = new Set<string>();
  for (const [hex, r] of socialHits) if (r.total > 0 && r.social === r.total) socialOnly.add(hex);
  const pseudoOnly = new Set<string>();
  for (const [hex, r] of pseudoHits) if (r.total > 0 && r.pseudo === r.total) pseudoOnly.add(hex);
  return { stats, tally, uaDefaults, socialOnly, pseudoOnly };
}

function clusterColors(
  stats: Map<string, ColorStat>,
  tally: Tally<string>,
  authored: AuthoredColor[],
  socialOnly: Set<string>,
  pseudoOnly: Set<string>,
): { clusters: ColorCluster[]; tail: ColorStat[] } {
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
        pages: new Set(s.pages), roles: { ...s.roles },
        name: '', generated: '', authored: null, jsonPath: '',
        brand: false, authoredConflicts: [], social: false, pseudoOnly: false, norm: 0,
      });
    }
  }
  // Page-weighted score for the cluster = sum over its merged raw colors.
  for (const cl of clusters) {
    cl.norm = cl.members.reduce((acc, m) => acc + tallyNorm(tally, m.hex), 0);
    cl.social = cl.members.every((m) => socialOnly.has(m.hex));
    cl.pseudoOnly = cl.members.every((m) => pseudoOnly.has(m.hex));
  }
  // Order by page-weighted score, not raw count — two listing pages carry half
  // the elements and would otherwise dictate the whole palette order.
  clusters.sort((a, b) => b.norm - a.norm || b.count - a.count || a.rep.hex.localeCompare(b.rep.hex));
  nameClusters(clusters, authored);
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

/**
 * Name every cluster, preferring FormFactor's own vocabulary.
 *
 * Authored names beat generated ones. `--primary` is a better token name than
 * `blue-800` in every way that matters: it is what the theme calls it, what the
 * CSS references, and what a person maintaining the site would search for. The
 * oklch-derived name is still computed and kept as `generated`, both as an alias
 * for consumers who want a tonal vocabulary and as an audit trail on the
 * clustering.
 *
 * A cluster claims an authored name when the authored hex is one of the raw
 * colors merged into it (exact match), or failing that when it sits within
 * COLOR_DELTA of the cluster representative. Exact match is tried first across
 * all clusters so a near-miss can never steal a name from its true owner.
 */
function nameClusters(clusters: ColorCluster[], authored: AuthoredColor[]): void {
  const brandColors = BRAND_HEXES.map((h) => parse(h)).filter((c): c is Color => Boolean(c));

  // Generated fallback name for every cluster first — always recorded.
  const usedGenerated = new Set<string>();
  for (const cl of clusters) {
    let base: string;
    if (cl.rep.hex === '#ffffff') base = 'neutral-white';
    else if (cl.rep.hex === '#000000') base = 'neutral-black';
    else base = `${hueFamily(cl.repColor)}-${lightnessStep(cl.repColor)}`;
    let name = base, n = 2;
    while (usedGenerated.has(name)) name = `${base}-${n++}`;
    cl.generated = name; usedGenerated.add(name);
    if (brandColors.some((bc) => ciede(cl.repColor, bc) <= 5)) cl.brand = true;
  }

  // Pass 1 — exact hex match against any raw color merged into the cluster.
  const claimed = new Set<string>();
  for (const av of authored) {
    for (const cl of clusters) {
      if (!cl.members.some((m) => m.hex === av.hex)) continue;
      if (cl.authored && cl.authored !== av.name) cl.authoredConflicts.push(av.name);
      else { cl.authored = av.name; }
      claimed.add(av.name);
      break;
    }
  }

  // Pass 2 — nearest unclaimed authored color within the clustering tolerance.
  for (const av of authored) {
    if (claimed.has(av.name)) continue;
    let best: ColorCluster | null = null;
    let bestD = Infinity;
    for (const cl of clusters) {
      if (cl.authored) continue;
      const d = ciede(av.color, cl.repColor);
      if (d <= COLOR_DELTA && d < bestD) { best = cl; bestD = d; }
    }
    if (best) { best.authored = av.name; claimed.add(av.name); }
  }

  // Display name + where the token lands in color.json.
  for (const cl of clusters) {
    if (cl.authored) {
      cl.name = cl.authored;
      cl.jsonPath = `theme.${cl.authored}`;
    } else {
      cl.name = cl.generated;
      const [family, ...rest] = cl.generated.split('-');
      cl.jsonPath = `palette.${family ?? 'neutral'}.${rest.join('-') || 'base'}`;
    }
  }
}

/**
 * Emit color.json in three groups:
 *   theme.*   — clusters that carry one of FormFactor's authored :root names.
 *               This is the canonical layer; prefer it when consuming.
 *   palette.* — observed clusters the theme never named, keyed family/step.
 *   brand.*   — convenience aliases for the two brand marks.
 *
 * `theme` and `palette` are separate namespaces rather than one flat set because
 * the authored names collide with the generated hue families: the theme has both
 * `--orange`/`--purple`/`--yellow` (single tokens) and the generator produces
 * `orange`/`purple`/`yellow` (groups of tonal steps). Flattening them would put
 * a $value and child steps on the same key.
 */
function buildColorTokens(clusters: ColorCluster[], nPages: number): unknown {
  const theme: Record<string, unknown> = {};
  const palette: Record<string, Record<string, unknown>> = {};
  const social: Record<string, unknown> = {};

  for (const cl of clusters) {
    // Core = site-wide (≥3 page templates); extended = confined to one or two.
    // Deliberately page-based, not count-based: see Tally.
    const tier = cl.pages.size >= 3 ? 'core' : 'extended';
    const token = {
      $value: cl.rep.hex,
      $type: 'color',
      ...(cl.social
        ? { $description: 'Social-platform brand color (share controls) — NOT a FormFactor color' }
        : cl.authored
        ? { $description: `FormFactor theme color \`--${cl.authored}\`` }
        : cl.brand ? { $description: 'FormFactor brand color' } : {}),
      $extensions: {
        [VENDOR]: {
          tier,
          authoredVar: cl.authored ? `--${cl.authored}` : null,
          generatedName: cl.generated,
          pseudoElementOnly: cl.pseudoOnly,
          count: cl.count,
          pageSpread: cl.pages.size,
          pageSpreadPct: Number(((cl.pages.size / Math.max(1, nPages)) * 100).toFixed(1)),
          normScore: Number(cl.norm.toFixed(4)),
          roles: cl.roles,
          oklch: roundOklch(cl.repColor),
          clusterMembers: cl.members.map((m) => ({ hex: m.hex, count: m.count })),
          pages: [...cl.pages].sort(),
          ...(cl.authoredConflicts.length ? { authoredConflicts: cl.authoredConflicts } : {}),
        },
      },
    };
    if (cl.social) {
      social[cl.generated] = token;
    } else if (cl.authored) {
      theme[cl.authored] = token;
    } else {
      const [family, ...rest] = cl.generated.split('-');
      (palette[family ?? 'neutral'] ??= {})[rest.join('-') || 'base'] = token;
    }
  }

  // Brand aliases — point at the authored names when we found them, so the
  // alias survives a re-run even if the observed hex shifts slightly.
  const brand: Record<string, unknown> = {};
  const alias = (key: string, authoredName: string, description: string): void => {
    if (theme[authoredName]) {
      brand[key] = { $value: `{color.theme.${authoredName}}`, $type: 'color', $description: description };
    }
  };
  alias('primary', 'primary', 'Alias of the FormFactor brand primary (navy)');
  alias('secondary', 'secondary', 'Alias of the FormFactor brand secondary (teal)');

  const out: Record<string, unknown> = {};
  if (Object.keys(theme).length) out['theme'] = theme;
  if (Object.keys(palette).length) out['palette'] = palette;
  if (Object.keys(social).length) out['social'] = social;
  if (Object.keys(brand).length) out['brand'] = brand;
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
  families: Tally<string>;
  sizes: Tally<number>;
  weights: Tally<number>;
  lineHeights: Tally<number>;
  combos: Tally<string>;
  comboMeta: Map<string, { family: string; size: number; weight: number; lineHeight: string; letterSpacing: string }>;
}

function collectTypography(pages: PageRaw[]): TypographyData {
  const d: TypographyData = {
    families: newTally(), sizes: newTally(), weights: newTally(),
    lineHeights: newTally(), combos: newTally(), comboMeta: new Map(),
  };
  for (const page of pages) {
    for (const el of page.elements) {
      const st = el.styles;
      const family = (st['font-family'] ?? '').trim();
      const size = pxOf(st['font-size'] ?? '');
      const weight = Number.parseInt(st['font-weight'] ?? '', 10);
      const lh = (st['line-height'] ?? '').trim();
      const ls = (st['letter-spacing'] ?? '').trim();
      if (family) tallyBump(d.families, family, page.slug);
      if (size) tallyBump(d.sizes, size, page.slug);
      if (Number.isFinite(weight)) tallyBump(d.weights, weight, page.slug);
      const lhPx = pxOf(lh);
      if (lhPx) tallyBump(d.lineHeights, lhPx, page.slug);
      if (family && size) {
        const key = `${family}|${size}|${weight}|${lh}|${ls}`;
        tallyBump(d.combos, key, page.slug);
        if (!d.comboMeta.has(key)) {
          d.comboMeta.set(key, { family, size, weight, lineHeight: lh, letterSpacing: ls });
        }
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

function buildTypographyTokens(d: TypographyData, nPages: number): { tokens: unknown; baseSize: number; baseFamily: string } {
  const baseFamily = tallyByNorm(d.families)[0] ?? 'sans-serif';
  const primaryName = (baseFamily.split(',')[0] ?? 'sans').replace(/["']/g, '').trim().toLowerCase().replace(/\s+/g, '-') || 'sans';

  const sizes = [...d.sizes.perKey.keys()];
  // Base size is the most page-weighted size, not the most frequent one: the two
  // listing pages would otherwise elect whatever their list items happen to use.
  const baseSize = tallyByNorm(d.sizes)[0] ?? 16;
  const sizeNames = sizeScaleNames(sizes, baseSize);

  const meta = <K,>(t: Tally<K>, k: K): Record<string, unknown> => ({
    count: tallyCount(t, k),
    pageSpread: tallySpread(t, k),
    pageSpreadPct: Number(((tallySpread(t, k) / Math.max(1, nPages)) * 100).toFixed(1)),
    normScore: Number(tallyNorm(t, k).toFixed(4)),
  });

  const fontFamily: Record<string, unknown> = {
    [primaryName]: {
      $value: baseFamily, $type: 'fontFamily', $description: 'Primary UI font stack',
      $extensions: { [VENDOR]: meta(d.families, baseFamily) },
    },
  };

  const fontSize: Record<string, unknown> = {};
  for (const [px, name] of [...sizeNames.entries()].sort((a, b) => a[0] - b[0])) {
    fontSize[name] = { $value: `${px}px`, $type: 'dimension', $extensions: { [VENDOR]: { ...meta(d.sizes, px), px } } };
  }

  const fontWeight: Record<string, unknown> = {};
  for (const w of tallyByNorm(d.weights)) {
    const name = WEIGHT_NAMES[w] ?? `w${w}`;
    fontWeight[name] = { $value: w, $type: 'fontWeight', $extensions: { [VENDOR]: meta(d.weights, w) } };
  }

  const lineHeight: Record<string, unknown> = {};
  [...d.lineHeights.perKey.keys()].sort((a, b) => a - b).forEach((px, i) => {
    lineHeight[`lh-${i}`] = { $value: `${px}px`, $type: 'dimension', $extensions: { [VENDOR]: { ...meta(d.lineHeights, px), px } } };
  });

  // Composite text styles — the most page-weighted (family, size, weight, lh)
  // combos, so a template that repeats one style 2000 times cannot monopolize.
  const textStyle: Record<string, unknown> = {};
  tallyByNorm(d.combos).slice(0, 10).forEach((key, i) => {
    const c = d.comboMeta.get(key);
    if (!c) return;
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
      $extensions: { [VENDOR]: { ...meta(d.combos, key), pages: tallyPages(d.combos, key) } },
    };
  });

  return { tokens: { fontFamily, fontSize, fontWeight, lineHeight, textStyle }, baseSize, baseFamily };
}

// ==========================================================================
// SPACING
// ==========================================================================

/**
 * Tally non-zero spacing values.
 *
 * Zero is deliberately excluded. 92.9% of the margin/padding observations in
 * this crawl are `0px` — the CSS default, not a design decision — and leaving
 * them in the tally inflates every page's normalization denominator ~14×, which
 * starves real values of score and collapses the dominant set to a handful. The
 * `0` token is emitted explicitly in buildSpacingTokens instead.
 */
function collectSpacing(pages: PageRaw[]): Tally<number> {
  const sizes = newTally<number>();
  const fields = ['margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left'];
  for (const page of pages) {
    for (const el of page.elements) {
      for (const f of fields) {
        const px = pxOf(el.styles[f] ?? '');
        if (px !== null && px > 0) tallyBump(sizes, px, page.slug);
      }
      const gap = (el.styles['gap'] ?? '').trim();
      if (gap && gap !== 'normal') for (const part of gap.split(/\s+/)) { const px = pxOf(part); if (px !== null && px > 0) tallyBump(sizes, px, page.slug); }
    }
  }
  return sizes;
}

// --- The authored modular scale --------------------------------------------

/**
 * Reconstruct the theme's `--size-*` scale from its own :root declarations.
 *
 * These resolve as *unevaluated* strings — `--size-500` computes to `1 * 1.33`,
 * not `1.33` — because they are only ever consumed inside `calc()`. So we parse
 * the multiplication ourselves rather than trusting a px value that never exists.
 * The result is a ~1.333 (4:3) modular scale off `--base-size`, and it is
 * load-bearing in type as well as spacing: the homepage hero is 67px, which is
 * 16 × 4.2 = `--size-900` exactly.
 */
interface ScaleStep { name: string; expr: string; multiplier: number; rem: number; px: number }

function reconstructModularScale(pages: PageRaw[], rootPx = 16): { steps: ScaleStep[]; ratio: number | null } {
  const vars = new Map<string, string>();
  for (const page of pages) {
    for (const [k, v] of Object.entries(page.cssVars)) {
      if (!isVendorVar(k) && /^--size-/.test(k)) vars.set(k, v.trim());
    }
  }
  const steps: ScaleStep[] = [];
  for (const [name, expr] of vars) {
    // Evaluate the "a * b * c" product the theme writes literally.
    const factors = expr.split('*').map((t) => Number.parseFloat(t.trim()));
    if (!factors.length || factors.some((f) => !Number.isFinite(f))) continue;
    const multiplier = factors.reduce((a, b) => a * b, 1);
    steps.push({ name: name.replace(/^--/, ''), expr, multiplier, rem: multiplier, px: Number((multiplier * rootPx).toFixed(2)) });
  }
  steps.sort((a, b) => a.multiplier - b.multiplier);

  // Geometric ratio between consecutive steps, if it is consistent.
  const ratios: number[] = [];
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1]!.multiplier;
    if (prev > 0) ratios.push(steps[i]!.multiplier / prev);
  }
  let ratio: number | null = null;
  if (ratios.length) {
    const mean = ratios.reduce((a, b) => a + b, 0) / ratios.length;
    const spread = Math.max(...ratios) - Math.min(...ratios);
    if (spread < 0.05) ratio = Number(mean.toFixed(3)); // consistent enough to call a scale
  }
  return { steps, ratio };
}

/**
 * Infer a base grid unit: the largest candidate (16/8/4/2) that a strong
 * majority of spacing observations are multiples of. Weighted by frequency so a
 * handful of off-grid component values don't break it. null = no consistent grid.
 */
function detectBase(sizes: Tally<number>): { base: number | null; coverage: number } {
  const keys = [...sizes.perKey.keys()].filter((px) => px > 0);
  const total = keys.reduce((a, px) => a + tallyNorm(sizes, px), 0);
  if (total === 0) return { base: null, coverage: 0 };
  for (const u of [16, 8, 4, 2]) {
    const onGrid = keys.filter((px) => px % u === 0).reduce((a, px) => a + tallyNorm(sizes, px), 0);
    if (onGrid / total >= 0.7) return { base: u, coverage: onGrid / total };
  }
  return { base: null, coverage: 0 };
}

function buildSpacingTokens(
  sizes: Tally<number>,
  scale: { steps: ScaleStep[]; ratio: number | null },
  nPages: number,
): { tokens: unknown; base: number | null; coverage: number; dominant: number[]; tail: number[] } {
  // Dominant = values carrying at least 0.5% of the page-weighted total. Norms
  // sum to the page count, so 0.005 * nPages is the direct analogue of the old
  // "0.5% of all observations" without letting two listing pages decide.
  const threshold = 0.005 * Math.max(1, nPages);
  const keys = [...sizes.perKey.keys()].filter((px) => px > 0);
  const dominant = keys.filter((px) => tallyNorm(sizes, px) >= threshold).sort((a, b) => a - b);
  const tail = keys.filter((px) => tallyNorm(sizes, px) < threshold).sort((a, b) => a - b);

  const { base, coverage } = detectBase(sizes);

  const space: Record<string, unknown> = { '0': { $value: '0px', $type: 'dimension' } };
  for (const px of dominant) {
    // Nearest authored --size-* step, so an observed value can be traced back to
    // the theme's scale rather than only to an inferred grid.
    let nearest: ScaleStep | null = null;
    let nearestDelta = Infinity;
    for (const st of scale.steps) {
      const d = Math.abs(st.px - px);
      if (d < nearestDelta) { nearest = st; nearestDelta = d; }
    }
    space[String(px)] = {
      $value: `${px}px`, $type: 'dimension',
      $extensions: {
        [VENDOR]: {
          count: tallyCount(sizes, px),
          pageSpread: tallySpread(sizes, px),
          normScore: Number(tallyNorm(sizes, px).toFixed(4)),
          steps: base ? Number((px / base).toFixed(2)) : null,
          nearestAuthoredStep: nearest ? { name: `--${nearest.name}`, px: nearest.px, deltaPx: Number(nearestDelta.toFixed(2)) } : null,
        },
      },
    };
  }

  // The theme's own scale, emitted alongside the observed values. This is the
  // authored intent; `space` is what actually renders.
  const authoredScale: Record<string, unknown> = {};
  for (const st of scale.steps) {
    authoredScale[st.name.replace(/^size-/, '')] = {
      $value: `${st.px}px`, $type: 'dimension',
      $description: `Authored \`--${st.name}\` — ${st.multiplier}× base`,
      $extensions: { [VENDOR]: { authoredVar: `--${st.name}`, rawExpression: st.expr, multiplier: st.multiplier, rem: st.rem } },
    };
  }

  const tokens: Record<string, unknown> = { space };
  if (Object.keys(authoredScale).length) tokens['scale'] = authoredScale;
  return { tokens, base, coverage, dominant, tail };
}

// ==========================================================================
// RADIUS + SHADOW
// ==========================================================================

function collectRaw(pages: PageRaw[], field: string, skip: (v: string) => boolean): Tally<string> {
  const t = newTally<string>();
  for (const page of pages) for (const el of page.elements) {
    const v = (el.styles[field] ?? '').trim();
    if (!v || skip(v)) continue;
    tallyBump(t, v, page.slug);
  }
  return t;
}

function buildRadiusTokens(radii: Tally<string>): { tokens: unknown; uniform: Array<[string, number]>; compound: Array<[string, number]> } {
  // Uniform = a single radius applied to all corners (the real scale). Compound
  // = per-corner radii (e.g. a chip rounded on one side) — listed, not scaled.
  const counts = tallyCounts(radii);
  const uniform = [...counts.entries()].filter(([v]) => !v.includes(' ')).sort((a, b) => radiusPx(a[0]) - radiusPx(b[0]));
  const compound = [...counts.entries()].filter(([v]) => v.includes(' ')).sort((a, b) => b[1] - a[1]);
  const names = ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];
  const radius: Record<string, unknown> = {};
  uniform.forEach(([value, count], i) => {
    const isPill = /9999px|50%/.test(value);
    const name = isPill ? 'full' : (names[i] ?? `r-${radiusPx(value)}`);
    let key = name, n = 2; while (key in radius) key = `${name}-${n++}`;
    radius[key] = {
      $value: value, $type: 'dimension',
      $extensions: { [VENDOR]: { count, pageSpread: tallySpread(radii, value), normScore: Number(tallyNorm(radii, value).toFixed(4)) } },
    };
  });
  return { tokens: { radius }, uniform, compound };
}

/** For each distinct value of `field`, which tag.class carries it (desc by count). */
function collectCarriers(pages: PageRaw[], field: string, skip: (v: string) => boolean): Map<string, Array<[string, number]>> {
  const byValue = new Map<string, Map<string, number>>();
  for (const page of pages) for (const el of page.elements) {
    const v = (el.styles[field] ?? '').trim();
    if (!v || skip(v)) continue;
    const first = el.classes.split(/\s+/).filter(Boolean)[0];
    const key = `${el.tag}${first ? '.' + first : ''}`;
    let m = byValue.get(v);
    if (!m) { m = new Map(); byValue.set(v, m); }
    m.set(key, (m.get(key) ?? 0) + 1);
  }
  const out = new Map<string, Array<[string, number]>>();
  for (const [v, m] of byValue) out.set(v, [...m.entries()].sort((a, b) => b[1] - a[1]));
  return out;
}

function radiusPx(v: string): number { const px = pxOf(v.split(/\s+/)[0] ?? ''); return px ?? (/(9999px|50%)/.test(v) ? 99999 : 0); }

/**
 * Elevation tokens, with one-off plugin shadows held back.
 *
 * A raw pass emits five "tokens" here, but three of them occur exactly once, on
 * a single page, from a plugin's own stylesheet (reCAPTCHA, Formidable). Naming
 * those `lg`/`xl`/`2xl` invents an elevation scale the site does not have. A
 * shadow earns a token by appearing on more than one page template or more than
 * a handful of times; the rest are reported as drift.
 */
function buildShadowTokens(shadows: Tally<string>): { tokens: unknown; ordered: Array<[string, number]>; drift: Array<[string, number]> } {
  const all = tallyByNorm(shadows).map((v) => [v, tallyCount(shadows, v)] as [string, number]);
  const isReal = ([value, count]: [string, number]): boolean =>
    tallySpread(shadows, value) >= 2 || count >= 5;
  const ordered = all.filter(isReal);
  const drift = all.filter((e) => !isReal(e));
  const names = ['sm', 'md', 'lg', 'xl', '2xl', '3xl', '4xl'];
  const shadow: Record<string, unknown> = {};
  ordered.forEach(([value, count], i) => {
    const name = names[i] ?? `shadow-${i}`;
    // NOTE: stored as the raw CSS string (not the W3C structured shadow object) —
    // box-shadow here mixes multiple layers + rgba; raw keeps it lossless.
    shadow[name] = {
      $value: value, $type: 'shadow',
      $extensions: { [VENDOR]: { count, pageSpread: tallySpread(shadows, value), normScore: Number(tallyNorm(shadows, value).toFixed(4)), raw: true } },
    };
  });
  return { tokens: { shadow }, ordered, drift };
}

// ==========================================================================
// REPORT
// ==========================================================================

function bar(value: number, max: number, width = 24): string {
  const n = max > 0 ? Math.max(0, Math.min(width, Math.round((value / max) * width))) : 0;
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
  spacingTally: Tally<number>;
  scale: { steps: ScaleStep[]; ratio: number | null };
  radiusUniform: Array<[string, number]>;
  radiusCompound: Array<[string, number]>;
  radiusCarriers: Map<string, Array<[string, number]>>;
  shadow: Array<[string, number]>;
  shadowDrift: Array<[string, number]>;
  themeVars: Array<[string, string]>;
  vendorVarCounts: Array<[string, number]>;
  authored: AuthoredColor[];
  uaDefaults: Map<string, UaDefaultStat>;
  droppedConsent: number;
  totalRead: number;
  pageSizes: Array<[string, number]>;
}): string {
  const {
    pages, clusters, colorTail, totalDistinctColors, typo, typoData, spacing, spacingTally, scale,
    radiusUniform, radiusCompound, radiusCarriers, shadow, shadowDrift, themeVars, vendorVarCounts, authored, uaDefaults,
    droppedConsent, totalRead, pageSizes,
  } = args;
  const nPages = pages.length;
  const maxNorm = clusters[0]?.norm ?? 1;
  const lines: string[] = [];

  lines.push('# FormFactor tokens — analysis report', '');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Source: ${nPages} pages under \`raw/\``, '');

  // --- Method: the two corrections that make these numbers trustworthy ------
  lines.push('## How to read this report', '');
  lines.push('Two properties of this particular crawl would produce a wrong palette if taken at face value, so both are corrected before anything is measured.', '');

  const keptPct = totalRead > 0 ? ((totalRead - droppedConsent) / totalRead) * 100 : 100;
  lines.push(`**1. Third-party overlay widgets are excluded.** **${droppedConsent} of ${totalRead} captured elements (${(100 - keptPct).toFixed(1)}%) were dropped**; ${totalRead - droppedConsent} remain. Two widgets mount on every page and are never dismissed:`, '');
  lines.push('- **CookieYes** hides its banner on accept but leaves the preference-center modal mounted with real dimensions (~73 elements/page). Its own body text `#212121` ranked **4th** in the unfiltered palette on 885 occurrences and is not a FormFactor color at all. It is also themed in FormFactor\'s teal, which inflated the real `#00a0af` by ~52%.');
  lines.push('- **WP Download Manager\'s side panel** contributes one hidden instance per page in stock Tailwind slate (`#0f172a`, `#1e293b`, `#64748b`) — three colors that otherwise entered the palette as *core* tokens at a deceptive 15/15 page spread.', '');
  lines.push('BB PowerPack (`pp-*`/`fl-*`) and Formidable (`frm-*`) are deliberately **not** filtered: those plugins build FormFactor\'s real pages and forms.', '');

  const top2 = pageSizes.slice(0, 2);
  const totalEls = pageSizes.reduce((a, [, n]) => a + n, 0);
  const top2Pct = totalEls > 0 ? (top2.reduce((a, [, n]) => a + n, 0) / totalEls) * 100 : 0;
  lines.push(`**2. Frequencies are page-weighted, not raw.** The two paginated index templates (${top2.map(([sl, n]) => `\`${sl}\` ${n}`).join(', ')}) are **${top2Pct.toFixed(1)}% of all elements**, so a raw histogram describes a press-release list item rather than FormFactor. Every ranking below uses:`, '');
  lines.push('- **spread** — how many of the ' + nPages + ' page templates a value appears on. Immune to page size.');
  lines.push('- **norm** — each page contributes one vote (its observations sum to 1.0), so all norms across a category sum to ' + nPages + '.', '');
  lines.push('Raw counts are still recorded in every token\'s `$extensions` so each decision stays auditable.', '');

  const pseudoCount = pages.reduce((a, p) => a + p.elements.filter((e) => e.pseudo).length, 0);
  lines.push(`**3. Pseudo-elements are captured.** \`querySelectorAll('*')\` cannot see \`::before\`/\`::after\`, but this theme paints real brand color with them — \`.page-header__body::after\` is the 4px orange rule under every page hero. The crawler therefore reads \`getComputedStyle(el, '::before'|'::after')\` too and keeps the ${pseudoCount} generated elements that actually paint a background or border. Without this pass \`--orange\` and \`--purple\` look like declared-but-unused vars when they are in fact rendered on most pages. Colors that *only* ever ship this way are marked \`pseudoElementOnly\`.`, '');

  lines.push('**4. Names are FormFactor\'s where FormFactor has one.** The theme publishes its own `:root` tokens, so clusters that match an authored var are named after it (`primary`, not `blue-800`) and live under `color.theme.*`. The oklch-derived name is retained as `generatedName`. Clusters with no authored match land in `color.palette.*`.', '');

  // --- Authored vs observed: the load-bearing question ----------------------
  lines.push('## Authored theme colors — load-bearing vs declared-only', '');
  lines.push(`The theme declares **${authored.length}** color vars in \`:root\`. Being declared is not the same as being used, and the split is the useful part:`, '');
  lines.push('', '| Authored var | Hex | Observed? | Token | Count | Spread | Roles (txt/bg/bdr) |', '|---|---|---|---|---:|---:|---|');
  const byAuthored = new Map<string, ColorCluster>();
  for (const cl of clusters) if (cl.authored) byAuthored.set(cl.authored, cl);
  for (const av of authored) {
    const cl = byAuthored.get(av.name);
    if (cl) {
      const how = cl.pseudoOnly ? '◐ via `::before`/`::after` only' : '✅ yes';
      lines.push(`| \`--${av.name}\` | \`${av.hex}\` | ${how} | \`color.theme.${av.name}\` | ${cl.count} | ${cl.pages.size}/${nPages} | ${cl.roles.text}/${cl.roles.bg}/${cl.roles.border} |`);
    } else {
      lines.push(`| \`--${av.name}\` | \`${av.hex}\` | ⚪️ declared only | — | 0 | 0/${nPages} | — |`);
    }
  }
  lines.push('');
  const unused = authored.filter((a) => !byAuthored.has(a.name));
  if (unused.length) {
    lines.push(`**${unused.length} declared-only:** ${unused.map((a) => `\`--${a.name}\``).join(', ')}. Present in the stylesheet but never resolved onto a rendered element in these ${nPages} templates. Treat as available-but-unproven, not as part of the working palette.`, '');
  } else {
    lines.push('Every authored color var is load-bearing — all of them resolve onto rendered elements.', '');
  }
  const conflicts = clusters.filter((c) => c.authoredConflicts.length);
  if (conflicts.length) {
    lines.push(`> ⚠️ **Clustering collapsed distinct authored colors.** ${conflicts.map((c) => `\`--${c.authored}\` absorbed ${c.authoredConflicts.map((x) => `\`--${x}\``).join(', ')}`).join('; ')}. ΔE ≤ ${COLOR_DELTA} is too permissive for these; lower \`ANALYZE_COLOR_DELTA\` if they must stay separate.`, '');
  }

  // Palette — split core (≥3 pages) vs extended (chart/accent, 1–2 pages).
  const core = clusters.filter((c) => c.pages.size >= 3);
  const extended = clusters.filter((c) => c.pages.size < 3);
  const colorRow = (cl: ColorCluster): string => {
    const roles = `${cl.roles.text}/${cl.roles.bg}/${cl.roles.border}`;
    const brand = cl.brand ? ' ⭐' : '';
    const src = cl.authored
      ? `\`--${cl.authored}\`${cl.pseudoOnly ? ' ◐' : ''}`
      : cl.social ? `_${cl.generated}_ (social)` : `_${cl.generated}_`;
    return `| \`${cl.name}\`${brand} | ${src} | \`${cl.rep.hex}\` | ${cl.norm.toFixed(3)} | ${cl.count} | ${roles} | ${cl.members.length} | ${cl.pages.size} |`;
  };

  lines.push('## Palette', '');
  lines.push(`${clusters.length} tokens clustered from ${totalDistinctColors} distinct observed colors (CIEDE2000 ΔE ≤ ${COLOR_DELTA}, seed min-count ${COLOR_MIN_COUNT}) — **${core.length} core** (≥3 page templates) + **${extended.length} extended** (confined to 1–2 templates). Ordered by page-weighted norm.`, '');
  const header = ['| Token | Source | Hex | Norm | Count | Roles (txt/bg/bdr) | Merged | Pages |', '|---|---|---|---:|---:|---|---:|---:|'];
  lines.push('### Core UI palette', '');
  lines.push('⭐ brand mark · ◐ ships only via `::before`/`::after` · (social) routed to `color.social.*`, not FormFactor\'s palette', '');
  lines.push(...header);
  for (const cl of core) lines.push(colorRow(cl));
  lines.push('');
  if (extended.length) {
    lines.push('### Extended (accent / one-off)', '', ...header);
    for (const cl of extended) lines.push(colorRow(cl));
    lines.push('');
  }
  lines.push('### Frequency, page-weighted (dominant → drift)', '', '```');
  for (const cl of clusters) lines.push(`${cl.rep.hex} ${cl.norm.toFixed(3).padStart(7)} ${bar(cl.norm, maxNorm)} ${cl.name}`);
  lines.push('```', '');
  const tailMembers = clusters.reduce((a, c) => a + (c.members.length - 1), 0);
  lines.push(`**Dominant vs drift:** the ${core.length} core tokens are the real palette; the ${extended.length} extended tokens are accents confined to one or two templates. ${tailMembers} near-duplicate shades were merged into their nearest token, and ${colorTail.length} rare one-off colors (count < ${COLOR_MIN_COUNT}) were dropped as drift.`, '');

  // --- UA defaults: absence of a decision, reported not tokenized ----------
  if (uaDefaults.size) {
    lines.push('## Unstyled elements (user-agent defaults)', '');
    lines.push('These colors are *observed* on real FormFactor elements but are Chromium defaults, not choices — an element that was never given a color. They are excluded from the palette and listed here because they are latent bugs rather than tokens.', '');
    lines.push('', '| Hex | What it is | Count | Pages | Selectors |', '|---|---|---:|---:|---|');
    const label: Record<string, string> = { '#0000ee': 'UA unstyled-link blue', '#551a8b': 'UA visited-link purple' };
    for (const d of [...uaDefaults.values()].sort((a, b) => b.count - a.count)) {
      const sels = [...d.selectors.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)
        .map(([sel, n]) => `\`${sel}\` (${n})`).join(', ');
      lines.push(`| \`${d.hex}\` | ${label[d.hex] ?? 'UA default'} | ${d.count} | ${d.pages.size}/${nPages} | ${sels} |`);
    }
    lines.push('');
    lines.push('Mostly harmless in practice: these are *wrapper* anchors around images and whole cards (`a.site-header__logo` wraps the logo SVG; `a.btn-inline` is a 421×328 card link), so the inherited blue never paints visible text. It is latent, not visible — but any bare text node added inside one would render browser-blue.', '');
  }

  // --- :root variables -----------------------------------------------------
  lines.push('## `:root` variables', '');
  if (themeVars.length === 0) {
    lines.push('> No authored `:root` design-token CSS variables were captured (only third-party/vendor vars), so the palette above is derived entirely from computed styles. This is unexpected for FormFactor — check that `wp-content/themes/formfactor-2022/style.css` was reachable during the crawl.', '');
  } else {
    const vendorTotal = vendorVarCounts.reduce((a, [, n]) => a + n, 0);
    lines.push(`**${themeVars.length} authored** theme vars, after filtering **${vendorTotal}** third-party vars. The theme names its own vars *unprefixed*, which is what makes them separable:`, '');
    lines.push('', '| Vendor prefix | Vars filtered | Why it must be filtered |', '|---|---:|---|');
    const why: Record<string, string> = {
      '--wp--': 'Gutenberg / core block defaults',
      '--wp-': 'Gutenberg / core block defaults',
      '--fa-': 'Font Awesome',
      '--frm-': 'Formidable Forms',
      '--ss-': 'slim-select dropdown',
      '--color-': '**BB PowerPack — `--color-primary` is `#4a8eff`, NOT FormFactor\'s `#003A63`**',
      '--clr-': 'BB PowerPack',
      '--wpdm-': 'WP Download Manager',
    };
    for (const [prefix, n] of vendorVarCounts) lines.push(`| \`${prefix}*\` | ${n} | ${why[prefix] ?? 'third-party'} |`);
    lines.push('');
    lines.push('Authored theme vars:', '', '```');
    for (const [k, v] of themeVars) lines.push(`${k}: ${v}`);
    lines.push('```', '');
  }

  // Typography
  lines.push('## Typography', '');
  lines.push(`Primary font: \`${typo.baseFamily}\``);
  lines.push(`Base size: **${typo.baseSize}px** (highest page-weighted norm).`, '');
  const sizeKeys = [...typoData.sizes.perKey.keys()].sort((a, b) => a - b);
  const maxSizeNorm = Math.max(...sizeKeys.map((px) => tallyNorm(typoData.sizes, px)), 0);
  lines.push(`${sizeKeys.length} distinct font sizes:`, '', '| px | Norm | Count | Spread | | Authored step |', '|---:|---:|---:|---:|---|---|');
  for (const px of sizeKeys) {
    // Type is driven by the same --size-* scale as spacing; show the match.
    let hit: ScaleStep | null = null;
    for (const st of scale.steps) if (Math.abs(st.px - px) <= 1.5) { hit = st; break; }
    lines.push(`| ${px} | ${tallyNorm(typoData.sizes, px).toFixed(3)} | ${tallyCount(typoData.sizes, px)} | ${tallySpread(typoData.sizes, px)}/${nPages} | \`${bar(tallyNorm(typoData.sizes, px), maxSizeNorm, 16)}\` | ${hit ? `\`--${hit.name}\` (${hit.px}px)` : '—'} |`);
  }
  lines.push('');
  lines.push('Font weights:', '', '| Weight | Norm | Count | Spread |', '|---:|---:|---:|---:|');
  for (const w of tallyByNorm(typoData.weights)) {
    lines.push(`| ${w} | ${tallyNorm(typoData.weights, w).toFixed(3)} | ${tallyCount(typoData.weights, w)} | ${tallySpread(typoData.weights, w)}/${nPages} |`);
  }
  lines.push('');

  // Spacing
  lines.push('## Spacing', '');
  if (scale.steps.length) {
    lines.push(`### The authored modular scale (\`--size-*\`)`, '');
    lines.push(scale.ratio
      ? `The theme's \`--size-*\` vars form a consistent **${scale.ratio}× modular scale** off \`--base-size\` — not an 8px grid. They resolve as *unevaluated* strings (\`--size-500\` computes to \`1 * 1.33\`) because they are only ever used inside \`calc()\`, so the multipliers are parsed rather than read as px.`
      : `The theme's \`--size-*\` vars are multipliers off \`--base-size\`, but the step ratio is not consistent enough to call a single modular scale.`, '');
    lines.push('', '| Var | Expression | Multiplier | px @16 |', '|---|---|---:|---:|');
    for (const st of scale.steps) lines.push(`| \`--${st.name}\` | \`${st.expr}\` | ${st.multiplier} | ${st.px} |`);
    lines.push('');
  }
  lines.push('### Observed spacing', '');
  if (spacing.base) lines.push(`Inferred base grid: **${spacing.base}px** (${Math.round(spacing.coverage * 100)}% of page-weighted spacing values are multiples).`);
  else lines.push('Inferred base grid: **none** — no single unit covers ≥70% of page-weighted values, which is what a multiplier-based modular scale looks like when you try to read a grid off it.');
  lines.push('');
  lines.push(`**${spacing.dominant.length} dominant values** (norm ≥ 0.5% of the page-weighted total):`, '', '| px | Norm | Count | Spread | Nearest authored step |', '|---:|---:|---:|---:|---|');
  for (const px of spacing.dominant) {
    let nearest: ScaleStep | null = null; let d = Infinity;
    for (const st of scale.steps) { const dd = Math.abs(st.px - px); if (dd < d) { nearest = st; d = dd; } }
    lines.push(`| ${px} | ${tallyNorm(spacingTally, px).toFixed(3)} | ${tallyCount(spacingTally, px)} | ${tallySpread(spacingTally, px)}/${nPages} | ${nearest ? `\`--${nearest.name}\` (${nearest.px}px, Δ${d.toFixed(1)})` : '—'} |`);
  }
  lines.push('');
  if (spacing.tail.length) lines.push(`Long tail (${spacing.tail.length} rare / off-scale values, flagged not tokenized): ${spacing.tail.join(', ')}`, '');

  // Radius — the carriers matter more than the counts here, because the rule is
  // "which kind of thing gets which radius", not "how many of each".
  lines.push('## Border radius', '');
  lines.push('| Radius | Count | Carried by (tag.class → count) |', '|---|---:|---|');
  for (const [v, c] of radiusUniform) {
    const carriers = (radiusCarriers.get(v) ?? []).slice(0, 4).map(([k, n]) => `\`${k}\` ${n}`).join(', ');
    lines.push(`| \`${v}\` | ${c} | ${carriers || '—'} |`);
  }
  lines.push('');
  if (radiusCompound.length) {
    for (const [v, c] of radiusCompound) {
      const carriers = (radiusCarriers.get(v) ?? []).slice(0, 3).map(([k, n]) => `\`${k}\` ${n}`).join(', ');
      lines.push(`- Compound / per-corner: \`${v}\` (${c}×) — ${carriers || 'n/a'}`);
    }
    lines.push('');
  }

  // Shadow
  lines.push('## Shadows', '');
  lines.push(`**${shadow.length} elevation token(s).** FormFactor barely uses shadow — there is no graduated elevation scale, just one common lift and a lighter variant.`, '');
  for (const [v, c] of shadow) lines.push(`- (${c}×) \`${v}\``);
  lines.push('');
  if (shadowDrift.length) {
    lines.push(`Held back as drift (single-instance, single-page, plugin-authored — naming these would invent an elevation scale the site does not have): ${shadowDrift.map(([v, c]) => `\`${v}\` (${c}×)`).join('; ')}`, '');
  }

  return lines.join('\n');
}

// ==========================================================================
// COMPONENTS
// ==========================================================================

const COMPONENTS_DIR = path.resolve('components');

interface VariantAgg {
  count: number;
  pages: Set<string>;
  byClasses: Map<string, { count: number; page: string; path: string; rect: RawElement['rect']; styles: Record<string, string> }>;
}
interface CompAgg { count: number; pages: Set<string>; variants: Map<string, VariantAgg>; }

interface ComponentDef {
  slug: string;
  name: string;
  purpose: string;
  whenToUse: string;
  match: (el: RawElement, cls: Set<string>) => boolean;
  variant: (el: RawElement, cls: Set<string>) => string;
  /**
   * Canonical markup, written by hand from the observed structure. Class names
   * are the theme's real ones so a prototype inherits the theme CSS; imagery is
   * always a placehold.co URL — FormFactor's own photography and logos are never
   * redistributed from this repo.
   */
  example?: string;
  /** Anything a consumer would get wrong without being told. */
  notes?: string[];
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

/** Exact class-token match (not substring — `page-header` must not match `page-header__body`). */
function hasClass(cls: Set<string>, name: string): boolean { return cls.has(name); }

/** True if the element paints a surface: a background, a shadow, or a real border. */
function isSurface(el: RawElement): boolean {
  const bg = normalizeColor(el.styles['background-color'] || '');
  if (bg && bg !== '#ffffff') return true;
  if ((el.styles['box-shadow'] || 'none') !== 'none') return true;
  return ['top', 'right', 'bottom', 'left'].some((side) => {
    const bw = pxOf(el.styles[`border-${side}-width`] || '');
    return bw !== null && bw > 0;
  });
}

// Detectors run in priority order; each element is attributed to the FIRST match
// (so a header <a> counts as nav-item, not link). Signals are the theme's own
// BEM-ish class names plus computed styles and geometry.
//
// Retuned in P4 against the 15-page crawl. Two heuristics inherited from the
// internal-app version of this pipeline were measurably wrong and are fixed here:
//
//   nav-item  bounded by `rect.y < 160 && rect.h >= 18`, which excluded all five
//             real nav links — they are 12px uppercase with no padding, so their
//             box is h=16. Now bounded by DOM ancestry (`site-header`/`mega-menu`
//             in the path), which is what we actually mean and is size-agnostic.
//   card      gated on `tag === 'div'`, which missed FormFactor's cards entirely:
//             they are `article.product-family-card` and `li.cta-card`, and
//             `article` carries 59 of the 115 rounded surfaces. Now accepts
//             article/li/section/div and treats background-color as a surface
//             signal, not just border/shadow.
const COMPONENT_DEFS: ComponentDef[] = [
  {
    slug: 'hero', name: 'Hero',
    purpose: 'The full-width page header: title, optional summary, optional CTA, over a washed background image.',
    whenToUse: 'Use once at the top of every page. The homepage variant is taller and splits its heading across two colors; every other template uses the standard variant.',
    match: (el, cls) => hasClass(cls, 'homepage-header') || hasClass(cls, 'page-header'),
    variant: (el, cls) => (hasClass(cls, 'homepage-header') ? 'homepage' : 'page'),
    notes: [
      'The `h1` is teal `--secondary` at 67.2px (`--size-900`) weight 400 in **every** template observed — 13/13. This is the strongest single brand rule on the site.',
      'The homepage variant additionally splits its sentence across two colors: the `h1` stays teal and an inner `<span>` carries navy `--primary`. That two-tone split is a homepage-only device, not a site-wide pattern.',
      'The background image is heavily washed out (near-white overlay) so dark text stays legible over it.',
      'A 4px orange rule (`--orange`, #F26728) closes the hero. It is painted by `.page-header__body::after`, not by an element — so it is invisible to any tool that only walks the DOM, and it is the only place `--orange` appears.',
    ],
    example: [
      '<div class="page-header">',
      '  <div class="wrapper">',
      '    <div class="page-header__body">',
      '      <div class="page-header__inner flow">',
      '        <h1 class="page-header__heading">Semiconductor Test</h1>',
      '        <div class="page-header__summary flow flow-space-300">',
      '          <p>We\'re paving the shortest path <strong>from lab to fab.</strong></p>',
      '        </div>',
      '        <a class="btn btn-primary flow-space-500" href="/about">Learn more</a>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>',
      '',
      '<!-- Homepage variant: same structure, two-tone heading -->',
      '<h1 class="homepage-header__heading">Semiconductor Test <span>and Measurement</span></h1>',
    ].join('\n'),
  },
  {
    slug: 'footer', name: 'Footer',
    purpose: 'Site-wide footer: four link columns, corporate info, and a bottom-rounded top edge.',
    whenToUse: 'Use on every page. The column count is driven by --footer-body-columns (3) with .col-one … .col-four in the markup.',
    match: (el, cls) => hasClass(cls, 'site-footer'),
    variant: () => 'default',
    notes: [
      'Top corners are rounded (`0px 0px 30px 30px` observed on `div.footer`) so the footer reads as a panel lifting off the page bottom.',
      '`--yellow` (#d2d755) appears here and essentially nowhere else — it is a footer-only accent on all 15 pages.',
    ],
    example: [
      '<footer class="site-footer">',
      '  <section class="site-footer__inner">',
      '    <div class="site-footer__body">',
      '      <div class="col col-one">  <!-- repeat col-two … col-four -->',
      '        <h3>Products</h3>',
      '        <ul><li><a href="/products/">Probe Cards</a></li></ul>',
      '      </div>',
      '    </div>',
      '    <div class="site-footer__info"><p>&copy; FormFactor, Inc.</p></div>',
      '  </section>',
      '</footer>',
    ].join('\n'),
  },
  {
    slug: 'cta-band', name: 'CTA band',
    purpose: 'A rounded, shadowed panel holding a centered heading and a grid of two or three calls to action.',
    whenToUse: 'Use to close a page, or between content sections, when you want to offer the reader two or three next steps of equal weight.',
    match: (el, cls) => hasClass(cls, 'cta-box'),
    variant: () => 'default',
    notes: [
      'The panel itself carries the utility classes `radius shadow` — 30px radius plus the site\'s one real elevation (`rgba(0,0,0,0.2) 0 4px 15px`).',
      'Two or three items per row via `ul.cta-grid`; each `li` uses `flow` for vertical rhythm.',
    ],
    example: [
      '<section class="cta-box">',
      '  <div class="wrapper">',
      '    <div class="cta-box__content flow radius shadow">',
      '      <div class="cta-box__heading flow center"><h2>Ready to talk?</h2></div>',
      '      <div class="cta-box__body">',
      '        <ul class="cta-grid">',
      '          <li class="flow flow-space-600">',
      '            <p>Talk to an applications engineer about your test challenge.</p>',
      '            <a class="btn btn-primary" href="/contact">Contact sales</a>',
      '          </li>',
      '        </ul>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</section>',
    ].join('\n'),
  },
  {
    slug: 'breadcrumb', name: 'Breadcrumb',
    purpose: 'Ancestor trail above the page content, rendered by WooCommerce.',
    whenToUse: 'Use on pages nested below a section index (products, categories, product detail). Absent on the homepage and top-level landing pages.',
    match: (el, cls) => hasClass(cls, 'woocommerce-breadcrumb'),
    variant: () => 'default',
    notes: [
      'Rendered by WooCommerce, so the markup is a flat `nav` with `/` separators rather than a list.',
      'Absent on the homepage and on top-level landing pages — 11 of 15 templates.',
    ],
    example: [
      '<nav class="woocommerce-breadcrumb">',
      '  <a href="/">Home</a> / <a href="/products/">Products</a> / Probe Cards',
      '</nav>',
    ].join('\n'),
  },
  {
    slug: 'card', name: 'Card',
    purpose: 'Rounded surface grouping a heading, description, image and link — the workhorse of every index page.',
    whenToUse: 'Use in a grid to present a set of peer items (product families, industries, posts, CTAs). Always 30px radius; never square.',
    match: (el, cls) => {
      if (!['article', 'li', 'div', 'section'].includes(el.tag)) return false;
      if (hasAnyClass(cls, /card|featured-post/)) return true;
      // Unnamed but visually a card: rounded surface of meaningful size.
      const radius = radiusPx(el.styles['border-radius'] || '');
      return radius >= 4 && isSurface(el) && el.rect.w >= 160 && el.rect.h >= 56;
    },
    variant: (el, cls) => {
      for (const c of cls) if (/card|featured-post/.test(c) && !/__/.test(c)) return c;
      return `${el.tag}-surface`;
    },
    notes: [
      'Always 30px radius. There is no square-cornered card on this site.',
      'The card is usually an `article` or `li`, not a `div` — 59 of the 115 rounded surfaces in the crawl are `article`.',
      'One image treatment rounds only the top corners (`30px 30px 0px 0px`) so the image meets the card edge flush.',
    ],
    example: [
      '<ul class="product-family-card__grid">',
      '  <li>',
      '    <article class="product-family-card radius shadow">',
      '      <img src="https://placehold.co/600x400" alt="">',
      '      <h2 class="product-family-card__heading">Apollo</h2>',
      '      <p class="product-family-card__description">',
      '        High-parallelism probe card for foundry and logic test.',
      '      </p>',
      '      <a class="btn btn-primary" href="/product/apollo/">View product</a>',
      '    </article>',
      '  </li>',
      '</ul>',
    ].join('\n'),
  },
  {
    slug: 'tabs', name: 'Tabs',
    purpose: 'Horizontal tab strip for switching between sibling views of the same page.',
    whenToUse: 'Use to filter an archive by year, or to split product detail into panes. Two implementations exist — the theme\'s own year tabs and BB PowerPack\'s pp-tabs.',
    match: (el, cls) => hasAnyClass(cls, /^(year-tab|tab-link|year-tray|pp-tabs?|pp-tab-)/),
    variant: (el, cls) => (hasAnyClass(cls, /^pp-/) ? 'pp-tabs (page builder)' : 'year-tabs (theme)'),
    notes: [
      'Two independent implementations coexist: the theme\'s `year-tray`/`year-tab` (archive filtering) and BB PowerPack\'s `pp-tabs` (product detail panes). Prefer the theme\'s when building new pages.',
      'The theme\'s year tab is an `h3` wrapping an `a.tab-link` — unusual markup, but it is what ships.',
    ],
    example: [
      '<div class="year-tray">',
      '  <h3 class="year-tab"><a class="tab-link active" href="?y=2026">2026</a></h3>',
      '  <h3 class="year-tab"><a class="tab-link" href="?y=2025">2025</a></h3>',
      '</div>',
    ].join('\n'),
  },
  {
    slug: 'form-field', name: 'Form field',
    purpose: 'Labelled input, select or textarea inside a Formidable form.',
    whenToUse: 'Use for all data entry. Note the radius exception: form controls are 20px, not the site-wide 30px.',
    match: (el, cls) => ['input', 'select', 'textarea'].includes(el.tag) || hasAnyClass(cls, /^(frm_primary_label|form-field)$/),
    variant: (el) => (el.tag === 'div' ? 'label' : el.tag),
    notes: [
      '**Radius exception:** form controls are 20px, not the site-wide 30px. This is the only deliberate deviation in the geometry.',
      'Markup comes from Formidable Forms, so class names are `frm_*`. They are real content, not vendor chrome.',
    ],
    example: [
      '<div class="frm_form_field form-field frm_top_container">',
      '  <label class="frm_primary_label" for="field_email">Work email</label>',
      '  <input type="email" id="field_email" name="item_meta[3]">',
      '</div>',
      '<input type="submit" class="frm_final_submit btn btn-primary" value="Submit">',
    ].join('\n'),
  },
  {
    slug: 'table', name: 'Table',
    purpose: 'Tabular data with a header row.',
    whenToUse: 'Use only for genuinely tabular data. Barely used on this site — see the honest-gaps note in the report.',
    match: (el) => el.tag === 'table',
    variant: () => 'default',
    notes: [
      'Only **one** table exists across all 15 crawled templates, so there is no house table style to speak of. Treat this as an unproven component and see the honest-gaps section of the README.',
    ],
  },
  {
    slug: 'button', name: 'Button',
    purpose: 'Pill-shaped action control. Navy fill by default, white fill on dark backgrounds.',
    whenToUse: 'Use for actions and primary navigation moments. The 30px radius on a 40px-tall control makes it a full pill — that is the brand read, do not square it.',
    // `skip-link` carries a `button` class but is an accessibility bypass link,
    // not a button: 17.6px, no radius, visually hidden until focused.
    match: (el, cls) => !hasClass(cls, 'skip-link') && (el.tag === 'button' || hasAnyClass(cls, /^(btn|button)(-|$)/)),
    variant: (el, cls) => {
      if (hasAnyClass(cls, /^contact-us-button/)) return 'edge-tab';
      if (hasAnyClass(cls, /button-light/)) return 'light';
      if (hasAnyClass(cls, /btn-inline/)) return 'inline (card wrapper)';
      return bgVariant(el);
    },
    notes: [
      '30px radius on a 40px-tall control is a full pill. Do not square it — this is the most recognisable geometry on the site.',
      'Label is 16px, padding `8px 20px`. Weight is 700 in 39 of 46 observed `btn-primary` instances; the 7 at weight 400 sit inside prose blocks and inherit it, which looks unintentional.',
      '`contact-us-button` is a distinctive persistent edge tab, present on every page: `position: fixed; right: 0; top: 25%; z-index: 9`, rotated `-90deg` so the label reads bottom-to-top, with its bottom corners squared (`border-bottom-*-radius: 0`) so the pill appears fused to the viewport edge. A separate `.contact-us-button-mobile` handles small screens.',
      '`btn-inline` is not a button at all — it is a card-sized wrapper anchor (421×328) that inherits the browser default blue. Do not copy it.',
      'The site also ships a visually-hidden `a.skip-link.button` for keyboard users (17.6px, no radius). It is excluded from the counts here because it is not a button.',
    ],
    example: [
      '<a class="btn btn-primary" href="/contact">Contact sales</a>',
      '<a class="btn btn-light" href="/learn">Learn more</a>       <!-- on dark bands -->',
      '<button class="button button-light">Back</button>           <!-- in mega-menu -->',
    ].join('\n'),
  },
  {
    slug: 'nav-item', name: 'Nav item',
    purpose: 'Link in the fixed site header — top-level mega-menu entries and their dropdown children.',
    whenToUse: 'Use inside the header to move between top-level sections. Uppercase, letterspaced, weight 600 at top level.',
    // Bounded by DOM ancestry, not geometry — the real links are h=16 and any
    // height threshold excludes them. See the note above COMPONENT_DEFS.
    match: (el) => el.tag === 'a' && /site-header|mega-menu/.test(el.path),
    variant: (el, cls) => {
      if (hasAnyClass(cls, /site-header__logo/)) return 'logo';
      if (hasAnyClass(cls, /menu-item/)) return 'top-level';
      return 'dropdown';
    },
    notes: [
      'Top-level links are 12px uppercase, letterspaced, weight 600, navy `--primary`, and their box is only **16px tall** — do not gate on height when detecting them.',
      'The header is `position: fixed; z-index: 6` at 92px tall, and does not appear in Chromium full-page screenshots. Use `screenshot-viewport.png` to see it.',
      'The logo is a 340px-wide inline SVG wrapped in an anchor that has no color declared.',
    ],
    example: [
      '<header class="site-header">',
      '  <div class="wrapper">',
      '    <div class="site-header__inner">',
      '      <a class="site-header__logo" href="/"><!-- 340px inline SVG --></a>',
      '      <nav id="mega-menu">',
      '        <div class="top-level">',
      '          <a class="menu-item" href="/products/">Products</a>',
      '          <a class="menu-item" href="/applications/">Applications</a>',
      '        </div>',
      '      </nav>',
      '    </div>',
      '  </div>',
      '</header>',
    ].join('\n'),
  },
  {
    slug: 'heading', name: 'Heading',
    purpose: 'Section and page titles. Teal at every level — this is the single strongest brand rule on the site.',
    whenToUse: 'Choose the level to match the document outline, never for visual size alone. Do not recolor: h1–h4 are teal --secondary in every template observed.',
    match: (el) => /^h[1-6]$/.test(el.tag),
    variant: (el) => el.tag.toLowerCase(),
    notes: [
      '**All heading levels are teal `--secondary` (#00a0af), not navy.** Observed: h1 67.2px, h2 45.3px, h3 30.0px, h4 24.7px — every one teal, weight 400.',
      'Only h1 (67.2px = `--size-900`) maps cleanly onto the authored `--size-*` scale; h2/h3/h4 do not.',
      'Weight is 400, not bold. The size carries the hierarchy, not the weight.',
    ],
    example: [
      '<h1 class="page-header__heading">Page title</h1>   <!-- 67.2px teal -->',
      '<h2>Section heading</h2>                            <!-- 45.3px teal -->',
      '<h3 class="font-base">Subsection</h3>               <!-- 30.0px teal -->',
    ].join('\n'),
  },
  {
    slug: 'link', name: 'Link',
    purpose: 'Inline and list text links. Navy on light surfaces, white on dark ones.',
    whenToUse: 'Use for navigation within body content; use a Button for actions.',
    match: (el) => el.tag === 'a',
    variant: (el) => {
      const c = normalizeColor(el.styles['color'] || '');
      if (!c) return 'unstyled';
      if (isBrand(c)) return 'default (navy)';
      if (c === '#ffffff') return 'inverse (on dark)';
      if (UA_DEFAULT_HEXES.has(c)) return 'unstyled (UA default)';
      return c;
    },
    notes: [
      'Navy `--primary` on light surfaces (955 instances), white on dark ones (445). Both are legitimate; pick by background.',
      '44 anchors inherit the browser default `#0000ee`. Every one is a *wrapper* anchor around an image or a whole card, so the blue never paints visible text — but do not imitate the pattern.',
    ],
    example: [
      '<a href="/technologies/">Contact intelligence</a>     <!-- navy on light -->',
      '<div class="dark-band"><a href="/company/">About us</a></div>  <!-- white on dark -->',
    ].join('\n'),
  },
];

function collectComponents(pages: PageRaw[]): Map<string, CompAgg> {
  const aggs = new Map<string, CompAgg>();
  for (const def of COMPONENT_DEFS) aggs.set(def.slug, { count: 0, pages: new Set(), variants: new Map() });
  for (const page of pages) {
    for (const el of page.elements) {
      const cls = classSet(el);
      // Pseudo-elements carry color and geometry but are not components — a
      // `.page-header__body::after` is a 4px orange rule, not a Card.
      if (el.pseudo) continue;
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
        if (!cc) { cc = { count: 0, page: page.slug, path: el.path, rect: el.rect, styles: el.styles }; v.byClasses.set(ckey, cc); }
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

/** Desktop crawl width — used only to spot elements parked off-canvas. */
const VIEWPORT_W = 1440;

/**
 * Pick the most representative instance of a variant.
 *
 * Naively taking the highest-count class string picks badly: the site's
 * most-repeated `btn btn-primary` is `search-close`, a collapsed search control
 * parked at x=1510 — off-canvas, invisible, and 0px radius because it is hidden.
 * So on-canvas instances are strongly preferred, and among those the one with the
 * largest painted area wins ties, since that is what a reader actually sees.
 */
function topClassesOf(v: VariantAgg): [string, VariantAgg['byClasses'] extends Map<string, infer T> ? T : never] | null {
  const entries = [...v.byClasses.entries()];
  const onCanvas = (e: typeof entries[number]): boolean => {
    const r = e[1].rect;
    return r.x >= 0 && r.x < VIEWPORT_W && r.y >= 0 && r.w > 0 && r.h > 0;
  };
  const pool = entries.filter(onCanvas);
  const ranked = (pool.length ? pool : entries).sort((a, b) =>
    b[1].count - a[1].count ||
    (b[1].rect.w * b[1].rect.h) - (a[1].rect.w * a[1].rect.h));
  return ranked[0] ?? null;
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

  if (def.notes?.length) {
    lines.push('## Rules and gotchas', '');
    for (const n of def.notes) lines.push(`- ${n}`);
    lines.push('');
  }

  if (def.example) {
    lines.push('## Canonical markup', '');
    lines.push('Real theme class names, so a prototype inherits the theme CSS. Imagery is a placeholder — FormFactor\'s own photography and logos are never redistributed from this repo.', '');
    lines.push('```html', def.example, '```', '');
  }

  const canonical = topClassesOf(variants[0]![1]);
  if (canonical) {
    const [classes, ex] = canonical;
    const s = ex.styles;
    lines.push('## Observed instance', '');
    lines.push(`The most representative on-canvas instance, for cross-checking against the screenshots.`, '');
    // The fixed header is missing from Chromium's full-page capture, so point at
    // the viewport shot for anything living in it.
    const shot = /site-header|mega-menu/.test(ex.path ?? '') || ex.rect.y < 92
      ? 'screenshot-viewport.png' : 'screenshot.png';
    lines.push(`- **Screenshot:** \`raw/${ex.page}/${shot}\` — region x:${ex.rect.x} y:${ex.rect.y} w:${ex.rect.w} h:${ex.rect.h}`);
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
    'Derived from the computed styles and screenshots of ' + pages.length + ' page templates on www.formfactor.com.', '',
    'Each component is detected from the `formfactor-2022` theme\'s own BEM-ish class names plus computed styles and geometry. Colors cross-link to `../tokens/color.json`, where tokens carry FormFactor\'s authored names (`primary`, `secondary`) rather than generated ones.', '',
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
  // Honest gaps. Two components this site was expected to have simply are not
  // there in the crawled templates, and saying so is more useful than inventing
  // a plausible-looking MDX for them.
  index.push('');
  index.push('## Honest gaps', '');
  index.push('- **No pull quote.** There are zero `<blockquote>` elements across all ' + pages.length + ' templates, including the long-form blog post. If a prototype needs one, it is being invented, not reproduced.');
  index.push('- **No spec table worth the name.** Exactly one `<table>` exists in the whole crawl (5 `<th>`, 20 `<td>`, on one industry page). The product detail page has no spec table at all, so there is no house table style to copy. `table.mdx` documents the single instance and should be treated as unproven.');
  index.push('- **Mega-menu dropdowns are captured but not exercised.** The `nav#mega-menu` panel is 740×395 and its contents are in the DOM, but the crawl never hovers it open, so the dropdown variant\'s rendered state is inferred from computed styles rather than seen.');
  index.push('- **Hover/focus states live in `raw/<page>/states.json`**, captured via CDP `forcePseudoState`, and are not yet folded into these files.');
  index.push('');
  await fs.writeFile(path.join(COMPONENTS_DIR, 'README.md'), index.join('\n') + '\n');
  return { written, skipped };
}

// --- Emit -----------------------------------------------------------------

async function writeJson(name: string, data: unknown): Promise<void> {
  await fs.writeFile(path.join(TOKENS_DIR, name), JSON.stringify(data, null, 2) + '\n');
}

// --- Main -----------------------------------------------------------------

async function main(): Promise<void> {
  const { pages, droppedConsent, totalRead } = await readRaw();
  if (pages.length === 0) throw new Error(`No pages with computed-styles.json under ${RAW_DIR}/.`);
  const nPages = pages.length;
  console.log(`Analyzing ${nPages} page(s): ${pages.map((p) => p.slug).join(', ')}`);
  if (droppedConsent > 0) {
    console.log(`  filtered ${droppedConsent}/${totalRead} elements (${((droppedConsent / totalRead) * 100).toFixed(1)}%) as third-party overlay chrome (CookieYes, WPDM panel)`);
  }
  await fs.mkdir(TOKENS_DIR, { recursive: true });

  // Authored theme colors — FormFactor's own names, which beat generated ones.
  const authored = collectAuthoredColors(pages);
  console.log(`  authored :root colors — ${authored.length} (${authored.map((a) => a.name).join(', ')})`);

  // Colors
  const { stats: colorStats, tally: colorTally, uaDefaults, socialOnly, pseudoOnly } = collectColors(pages);
  const { clusters, tail } = clusterColors(colorStats, colorTally, authored, socialOnly, pseudoOnly);
  await writeJson('color.json', buildColorTokens(clusters, nPages));
  const namedCount = clusters.filter((c) => c.authored).length;
  console.log(`  color.json     — ${clusters.length} tokens from ${colorStats.size} distinct colors (${namedCount} carry authored names)`);

  // Typography
  const typoData = collectTypography(pages);
  const { tokens: typoTokens, baseSize, baseFamily } = buildTypographyTokens(typoData, nPages);
  await writeJson('typography.json', typoTokens);
  console.log(`  typography.json — ${typoData.sizes.perKey.size} sizes, ${typoData.weights.perKey.size} weights, base ${baseSize}px`);

  // Spacing — the authored --size-* scale plus what actually renders.
  const scale = reconstructModularScale(pages);
  const spacingTally = collectSpacing(pages);
  const { tokens: spacingTokens, base, coverage, dominant, tail: spacingTail } = buildSpacingTokens(spacingTally, scale, nPages);
  await writeJson('spacing.json', spacingTokens);
  console.log(`  spacing.json   — ${scale.steps.length} authored steps${scale.ratio ? ` (ratio ${scale.ratio})` : ''}, ${dominant.length} observed (${spacingTail.length} tail), grid ${base ? base + 'px' : 'none'}`);

  // Radius + shadow
  const radii = collectRaw(pages, 'border-radius', (v) => v === '0px');
  const radiusCarriers = collectCarriers(pages, 'border-radius', (v) => v === '0px');
  const { tokens: radiusTokens, uniform: radiusUniform, compound: radiusCompound } = buildRadiusTokens(radii);
  await writeJson('radius.json', radiusTokens);
  const shadows = collectRaw(pages, 'box-shadow', (v) => v === 'none');
  const { tokens: shadowTokens, ordered: shadowOrdered, drift: shadowDrift } = buildShadowTokens(shadows);
  await writeJson('shadow.json', shadowTokens);
  console.log(`  radius.json    — ${radiusUniform.length} uniform (+${radiusCompound.length} compound)`);
  console.log(`  shadow.json    — ${shadowOrdered.length} values`);

  // :root vars, split authored vs third-party. Only the unprefixed set is the
  // theme's; see VENDOR_VAR_PREFIXES for why --color-* must never be trusted.
  const themeVarMap = new Map<string, string>();
  const vendorCounts = new Map<string, number>();
  const seenVendor = new Set<string>();
  for (const page of pages) {
    for (const [k, v] of Object.entries(page.cssVars)) {
      if (isVendorVar(k)) {
        if (!seenVendor.has(k)) {
          seenVendor.add(k);
          const prefix = VENDOR_VAR_PREFIXES.find((pre) => k.startsWith(pre))!;
          inc(vendorCounts, prefix);
        }
        continue;
      }
      themeVarMap.set(k, v);
    }
  }
  const themeVars = [...themeVarMap.entries()].sort();
  const vendorVarCounts = sortedByCountDesc(vendorCounts);
  console.log(`  :root vars     — ${themeVars.length} authored, ${seenVendor.size} third-party filtered`);

  // Report
  const pageSizes = pages.map((p) => [p.slug, p.elements.length] as [string, number])
    .sort((a, b) => b[1] - a[1]);
  const report = buildReport({
    pages, clusters, colorTail: tail, totalDistinctColors: colorStats.size,
    typo: { baseSize, baseFamily }, typoData,
    spacing: { base, coverage, dominant, tail: spacingTail }, spacingTally, scale,
    radiusUniform, radiusCompound, radiusCarriers, shadow: shadowOrdered, shadowDrift,
    themeVars, vendorVarCounts, authored, uaDefaults,
    droppedConsent, totalRead, pageSizes,
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
