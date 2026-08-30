/**
 * crawl.ts — Stage 1 of the FormFactor design-system extraction pipeline.
 *
 * Visits a curated list of pages on www.formfactor.com and writes RAW artifacts
 * per page into ./raw/<slug>/:
 *   - computed-styles.json   one entry per visible element (design props only)
 *   - css-variables.json     all --* custom properties resolved off :root
 *   - stylesheets.css        concatenated same-origin stylesheet text
 *   - screenshot.png         full-page screenshot (NB: omits the fixed header)
 *   - screenshot-viewport.png above-the-fold shot — header, nav, hero
 *   - states.json            :hover/:focus/:active style deltas (unless FF_CAPTURE_STATES=0)
 * plus a top-level ./raw/manifest.json listing every page crawled + status.
 *
 * No auth: FormFactor is a public site. The only network hygiene we need is a
 * real browser User-Agent (the origin 403s default/bot UAs) and dismissing the
 * cookie/consent overlay so it doesn't sit on top of every screenshot.
 *
 * Env knobs: FF_BASE_URL, FF_SEEDS, FF_OUTPUT_DIR, FF_VIEWPORT (WxH), FF_CONSENT_TIMEOUT_MS,
 * FF_NAV_TIMEOUT_MS, FF_SETTLE_MS, FF_DOM_QUIET_MS, FF_DOM_MAX_MS,
 * FF_AUTOSCROLL=0, FF_CAPTURE_STATES=0, FF_MAX_STATE_TARGETS,
 * FF_FOLLOW_LINKS=1, FF_MAX_PAGES, FF_HEADED=1, FF_BROWSER_PATH.
 *
 *   npm install
 *   npx playwright install chromium
 *   npx tsx scripts/crawl.ts
 */

import { chromium, type BrowserContext, type Page } from 'playwright';
import { promises as fs } from 'fs';
import * as path from 'path';

// --- Config ---------------------------------------------------------------

const BASE_URL = process.env.FF_BASE_URL ?? 'https://www.formfactor.com/';
const SEEDS_FILE = path.resolve('seeds.txt');
const OUTPUT_DIR = path.resolve(process.env.FF_OUTPUT_DIR ?? 'raw');
const MANIFEST_FILE = path.join(OUTPUT_DIR, 'manifest.json');

// Per-page navigation budget. networkidle can never settle on a page with
// polling analytics/chat widgets, so we navigate to domcontentloaded under a
// hard timeout, then give the page a softer window to *reach* networkidle
// without failing if it never does.
const NAV_TIMEOUT_MS = Number(process.env.FF_NAV_TIMEOUT_MS ?? 60_000);
const SETTLE_TIMEOUT_MS = Number(process.env.FF_SETTLE_MS ?? 8_000);

// After the soft networkidle, wait for the DOM to go quiescent — resolves once
// there have been no mutations for DOM_QUIET_MS, capped at DOM_MAX_MS.
const DOM_QUIET_MS = Number(process.env.FF_DOM_QUIET_MS ?? 1_200);
const DOM_MAX_MS = Number(process.env.FF_DOM_MAX_MS ?? 15_000);

// Auto-scroll the page to trigger lazy images and scroll-reveal animations
// before capture. On by default; disable with FF_AUTOSCROLL=0.
const AUTOSCROLL = !/^(0|false|no)$/i.test(process.env.FF_AUTOSCROLL ?? '1');

// Capture :hover / :focus / :active styles for interactive elements via CDP
// CSS.forcePseudoState, saved to raw/<slug>/states.json. On by default.
const CAPTURE_STATES = !/^(0|false|no)$/i.test(process.env.FF_CAPTURE_STATES ?? '1');
const MAX_STATE_TARGETS = Number(process.env.FF_MAX_STATE_TARGETS ?? 80);
const PSEUDO_STATES = ['hover', 'focus', 'active'] as const;

// Optional shallow, same-origin link following (depth 1). Off by default — the
// curated seed list is the point (see seeds.txt). MAX_PAGES is a hard cap.
const FOLLOW_LINKS = /^(1|true|yes)$/i.test(process.env.FF_FOLLOW_LINKS ?? '');
const MAX_PAGES = Number(process.env.FF_MAX_PAGES ?? 50);

// Headless by default; FF_HEADED=1 to watch it run (useful when debugging a
// page that renders differently under automation).
const HEADED = /^(1|true|yes)$/i.test(process.env.FF_HEADED ?? '');

// Desktop viewport by default. A marketing site is responsive, so the same seed
// list is worth re-running at a phone width into a separate output dir:
//   FF_VIEWPORT=390x844 FF_OUTPUT_DIR=raw-mobile npx tsx scripts/crawl.ts
const [VIEWPORT_W, VIEWPORT_H] = (process.env.FF_VIEWPORT ?? '1440x900')
  .split('x').map((n) => Number(n.trim()));

// www.formfactor.com 403s non-browser User-Agents (verified: plain curl gets
// 403, this UA gets 200). Playwright's default UA advertises HeadlessChrome, so
// we pin a normal desktop Chrome UA.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

// Design-relevant computed properties to capture per element.
const CAPTURED_PROPS = [
  'color',
  'background-color',
  'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
  // All four widths, not just the top. A rule that sets only `border-bottom`
  // leaves border-top-width at 0, and gating the colors on the top width alone
  // makes those borders invisible to the analyzer — verified: --tertiary-dark
  // ships as a border-right-color on an element whose top width is 0.
  'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
  'border-radius',
  'box-shadow',
  'outline-color', 'outline-width', 'outline-style', 'outline-offset',
  'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing',
  'text-transform',
  'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'gap',
];

// --- Helpers --------------------------------------------------------------

async function fileExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

/**
 * Decide which browser executable Playwright should launch.
 *   1. FF_BROWSER_PATH override, if it points at an existing binary
 *   2. Playwright's bundled Chromium (executablePath undefined)
 */
async function resolveBrowser(): Promise<{ executablePath: string | undefined; label: string }> {
  const override = process.env.FF_BROWSER_PATH;
  if (override) {
    if (await fileExists(override)) return { executablePath: override, label: `FF_BROWSER_PATH (${override})` };
    console.warn(`FF_BROWSER_PATH=${override} does not exist — ignoring and falling back.`);
  }
  return { executablePath: undefined, label: 'Playwright bundled Chromium' };
}

function slugify(url: string): string {
  const u = new URL(url);
  const slug = (u.pathname + u.search).replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  return slug || 'home';
}

const BASE_ORIGIN = new URL(BASE_URL).origin;

/** Normalize a URL for dedup: absolute, hash stripped, no trailing slash (except root). null if unparseable. */
function normalizeUrl(raw: string): string | null {
  try {
    const u = new URL(raw, BASE_URL);
    u.hash = '';
    if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, '');
    return u.toString();
  } catch { return null; }
}

/** True if `raw` resolves to the same origin as BASE_URL. */
function isSameOrigin(raw: string): boolean {
  try { return new URL(raw, BASE_URL).origin === BASE_ORIGIN; } catch { return false; }
}

// --- Consent / overlay dismissal ------------------------------------------

// Cookie banners and newsletter modals sit on top of the page: they poison the
// screenshot and inject their own (non-brand) colors into the computed-style
// sample. Click the accept control if one is present, then wait for it to go.
// www.formfactor.com uses CookieYes (`.cky-btn-accept`) — that's the one that
// actually fires here; the rest cover the other common vendors so this script
// stays useful if the site switches, or if you point it at another origin.
const CONSENT_SELECTORS = [
  '.cky-btn-accept',
  '#onetrust-accept-btn-handler',
  '#hs-eu-confirmation-button',
  'button#truste-consent-button',
  '#cookie_action_close_header',
  '[aria-label="Accept cookies"]',
  'button:has-text("Accept All Cookies")',
  'button:has-text("Accept All")',
  'button:has-text("Accept Cookies")',
  'button:has-text("I Accept")',
];

// The banner mounts asynchronously, well after domcontentloaded. This is the
// budget we give it to appear before concluding there isn't one.
const CONSENT_TIMEOUT_MS = Number(process.env.FF_CONSENT_TIMEOUT_MS ?? 6_000);

/**
 * Best-effort: dismiss a cookie/consent overlay if one is showing. Never throws
 * and never fails the crawl — a page with no banner is the normal case.
 * Returns the selector that worked, or null.
 *
 * We WAIT for the banner rather than probing for it. `locator.isVisible()`
 * answers immediately, so the obvious "loop the selectors and check each"
 * version silently reports "no banner" on every page — it runs before the
 * consent script has mounted anything.
 */
async function dismissConsent(page: Page): Promise<string | null> {
  const combined = CONSENT_SELECTORS.join(', ');
  try {
    await page.locator(combined).first().waitFor({ state: 'visible', timeout: CONSENT_TIMEOUT_MS });
  } catch {
    return null; // no consent overlay on this page — the normal case after the first accept
  }
  // Work out which selector actually matched, so the manifest records it.
  for (const sel of CONSENT_SELECTORS) {
    const el = page.locator(sel).first();
    if (!(await el.isVisible().catch(() => false))) continue;
    try {
      await el.click({ timeout: 2_000 });
      await el.waitFor({ state: 'hidden', timeout: 3_000 }).catch(() => {});
      await page.waitForTimeout(300);
      return sel;
    } catch { /* not clickable — try the next matching selector */ }
  }
  return null;
}

// --- Extraction (runs in the page context) --------------------------------

/**
 * Walks the DOM and returns design-relevant computed styles for every visible
 * element, plus all :root custom properties and same-origin stylesheet text.
 *
 * NOTE: this function is serialized and executed in the browser, so it must be
 * fully self-contained (no references to Node-side variables except `props`).
 */
function extractInPage(props: string[]) {
  function cssPath(el: Element): string {
    const parts: string[] = [];
    let node: Element | null = el;
    while (node && node.nodeType === 1 && parts.length < 5) {
      let part = node.tagName.toLowerCase();
      if (node.id) { parts.unshift(`${part}#${node.id}`); break; }
      const cls = (node.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) part += '.' + cls.join('.');
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  }

  // Per-element computed styles (visible elements only), plus ::before/::after.
  //
  // The pseudo-element pass is not optional decoration. querySelectorAll('*')
  // cannot see pseudo-elements, and this theme paints real brand color with them:
  //   .page-header__body::after { height: 4px; background: var(--orange) }
  // is the orange rule under every page hero. Without this pass, --orange and
  // --purple look like declared-but-unused vars when they are in fact rendered on
  // most pages. Pseudo entries carry the host's rect and a `pseudo` field.
  const elements: Array<Record<string, unknown>> = [];
  document.querySelectorAll('*').forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const tag = el.tagName.toLowerCase();
    const classes = (el.getAttribute('class') ?? '').trim();
    const path = cssPath(el);
    const box = { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) };

    const cs = getComputedStyle(el);
    const styles: Record<string, string> = {};
    for (const p of props) styles[p] = cs.getPropertyValue(p).trim();
    elements.push({ tag, classes, path, rect: box, styles });

    for (const pseudo of ['::before', '::after']) {
      const ps = getComputedStyle(el, pseudo);
      // `content: none` means the pseudo-element is not generated at all.
      const content = ps.getPropertyValue('content').trim();
      if (!content || content === 'none') continue;
      const pStyles: Record<string, string> = {};
      for (const p of props) pStyles[p] = ps.getPropertyValue(p).trim();
      // Keep only pseudo-elements that actually paint something, otherwise every
      // `content: ""` clearfix in the stylesheet enters the sample.
      const paints =
        (pStyles['background-color'] && !/^rgba\(0, 0, 0, 0\)$/.test(pStyles['background-color'])) ||
        ['top', 'right', 'bottom', 'left'].some((side) => {
          const w = pStyles[`border-${side}-width`] ?? '';
          return w && Number.parseFloat(w) > 0;
        });
      if (!paints) continue;
      elements.push({
        tag: `${tag}${pseudo}`, classes, path: `${path}${pseudo}`, pseudo,
        rect: box, styles: pStyles,
      });
    }
  });

  // :root custom properties — discovered from same-origin stylesheets, resolved
  // off documentElement so we get the real computed value. On FormFactor this is
  // the jackpot: the formfactor-2022 theme authors --primary/--secondary/--size-*
  // itself, so these are the site's OWN token names, not ones we invent.
  const rootStyle = getComputedStyle(document.documentElement);
  const varNames = new Set<string>();
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        const r = rule as CSSStyleRule;
        if (!r.selectorText || !r.style) continue;
        if (/:root|html/.test(r.selectorText)) {
          for (let i = 0; i < r.style.length; i++) {
            const name = r.style[i];
            if (name && name.startsWith('--')) varNames.add(name);
          }
        }
      }
    } catch { /* cross-origin stylesheet — skip */ }
  }
  const cssVariables: Record<string, string> = {};
  varNames.forEach((name) => { cssVariables[name] = rootStyle.getPropertyValue(name).trim(); });

  // Same-origin stylesheet text.
  const stylesheetChunks: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      const text = Array.from(sheet.cssRules).map((r) => r.cssText).join('\n');
      if (text) stylesheetChunks.push(`/* ${sheet.href ?? 'inline'} */\n${text}`);
    } catch { /* cross-origin stylesheet — skip */ }
  }

  return { elements, cssVariables, stylesheets: stylesheetChunks.join('\n\n') };
}

// --- Page settling ---------------------------------------------------------

/**
 * Wait for the page to stop changing before we read it: soft networkidle, then
 * DOM quiescence (no mutations for DOM_QUIET_MS, hard-capped at DOM_MAX_MS),
 * then web fonts. Fonts matter here — FormFactor loads Proxima Nova, and reading
 * font metrics before fonts.ready would sample the fallback stack.
 */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: SETTLE_TIMEOUT_MS }).catch(() => {});
  await page.evaluate(({ quiet, max }) => new Promise<void>((resolve) => {
    let timer = 0;
    const finish = (): void => { observer.disconnect(); clearTimeout(timer); resolve(); };
    const bump = (): void => { clearTimeout(timer); timer = window.setTimeout(finish, quiet); };
    const observer = new MutationObserver(bump);
    observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true });
    bump();                          // start the quiet countdown immediately
    window.setTimeout(finish, max);  // hard cap so polling pages don't hang
  }), { quiet: DOM_QUIET_MS, max: DOM_MAX_MS });
  await page.evaluate(() => (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts?.ready).catch(() => {});
}

/** Scroll through the page to trigger lazy images / scroll-reveal, then return to top. */
async function autoScroll(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
    let last = -1;
    for (let i = 0; i < 50; i++) {
      window.scrollTo(0, document.documentElement.scrollHeight);
      await sleep(250);
      const h = document.documentElement.scrollHeight;
      if (h === last) break;        // stopped growing — done
      last = h;
    }
    // Return to top and give a scroll-hide header time to come back. FormFactor's
    // #site-header is fixed and hides on scroll; without this wait the full-page
    // screenshot captures the page with no header on it (the computed styles are
    // unaffected, but P4 reads components off the screenshots).
    window.scrollTo(0, 0);
    window.dispatchEvent(new Event('scroll'));
    await sleep(800);
  });
}

// --- State capture ---------------------------------------------------------

interface StateEntry {
  tag: string;
  classes: string;
  path: string;
  base: Record<string, string>;                       // base values for props that change
  states: Record<string, Record<string, string>>;     // state -> changed prop -> value
}

/**
 * Capture :hover/:focus/:active styles for interactive elements. We tag each
 * target with a data-attribute, then for each pseudo-state use CDP
 * CSS.forcePseudoState to force it and re-read getComputedStyle, recording only
 * the props that differ from base. Chromium-only (we use bundled Chromium).
 */
async function captureStates(page: Page, props: string[]): Promise<StateEntry[]> {
  // 1. Tag interactive, visible elements and snapshot their base styles.
  const targets = await page.evaluate(({ props, max }) => {
    const SEL = 'a, button, input, select, textarea, summary, label, [role="button"], [role="tab"], [tabindex]';
    const out: Array<{ id: string; tag: string; classes: string; path: string; base: Record<string, string> }> = [];
    let i = 0;
    for (const el of Array.from(document.querySelectorAll(SEL))) {
      if (out.length >= max) break;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;
      const id = `ds-${i++}`;
      el.setAttribute('data-ds-state', id);
      const parts: string[] = [];
      let node: Element | null = el;
      while (node && parts.length < 4) {
        let p = node.tagName.toLowerCase();
        const c = (node.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
        if (c.length) p += '.' + c.join('.');
        parts.unshift(p);
        node = node.parentElement;
      }
      const cs = getComputedStyle(el);
      const base: Record<string, string> = {};
      for (const pr of props) base[pr] = cs.getPropertyValue(pr).trim();
      out.push({ id, tag: el.tagName.toLowerCase(), classes: (el.getAttribute('class') ?? '').trim(), path: parts.join(' > '), base });
    }
    return out;
  }, { props, max: MAX_STATE_TARGETS });

  const client = await page.context().newCDPSession(page);
  const entries: StateEntry[] = [];
  try {
    await client.send('DOM.enable');
    await client.send('CSS.enable');
    const doc = await client.send('DOM.getDocument', { depth: 0 }) as { root: { nodeId: number } };
    const rootId = doc.root.nodeId;

    for (const t of targets) {
      const sel = `[data-ds-state="${t.id}"]`;
      const found = await client.send('DOM.querySelector', { nodeId: rootId, selector: sel }) as { nodeId: number };
      if (!found.nodeId) continue;
      const states: Record<string, Record<string, string>> = {};
      for (const state of PSEUDO_STATES) {
        try {
          await client.send('CSS.forcePseudoState', { nodeId: found.nodeId, forcedPseudoClasses: [state] });
          const after = await page.$eval(sel, (el, props) => {
            const cs = getComputedStyle(el);
            const o: Record<string, string> = {};
            for (const pr of props as string[]) o[pr] = cs.getPropertyValue(pr).trim();
            return o;
          }, props);
          const changes: Record<string, string> = {};
          for (const pr of props) if ((after[pr] ?? '') !== (t.base[pr] ?? '')) changes[pr] = after[pr] ?? '';
          if (Object.keys(changes).length) states[state] = changes;
        } finally {
          await client.send('CSS.forcePseudoState', { nodeId: found.nodeId, forcedPseudoClasses: [] });
        }
      }
      if (Object.keys(states).length) {
        const changedProps = new Set(Object.values(states).flatMap((s) => Object.keys(s)));
        const base: Record<string, string> = {};
        for (const pr of changedProps) base[pr] = t.base[pr] ?? '';
        entries.push({ tag: t.tag, classes: t.classes, path: t.path, base, states });
      }
    }
  } finally {
    await client.detach().catch(() => {});
    await page.evaluate(() => document.querySelectorAll('[data-ds-state]').forEach((el) => el.removeAttribute('data-ds-state')));
  }
  return entries;
}

// --- Per-page crawl --------------------------------------------------------

interface PageResult {
  url: string;          // requested URL
  slug: string;         // raw/<slug>/
  finalUrl: string;     // URL after redirects
  ok: boolean;
  status: number | null;
  elements: number;     // elements captured
  cssVars: number;      // :root custom properties captured
  consent: string | null; // selector used to dismiss a consent overlay, if any
  crawledAt: string;    // ISO timestamp
  error: string | null;
}

/**
 * Crawl one page → raw/<slug>/. Returns a manifest result plus the same-origin
 * links found on the page (for optional following). Throws on navigation
 * failure so the caller can record it.
 */
async function crawlPage(context: BrowserContext, url: string): Promise<{ result: PageResult; links: string[] }> {
  const slug = slugify(url);
  const dir = path.join(OUTPUT_DIR, slug);
  await fs.mkdir(dir, { recursive: true });

  const page = await context.newPage();
  page.setDefaultTimeout(NAV_TIMEOUT_MS);

  // tsx/esbuild wraps named functions with a __name() helper to preserve
  // Function.name. When Playwright serializes our extractor and runs it in the
  // page, that helper is undefined there → "ReferenceError: __name is not
  // defined". Shim it in the page world before any evaluate() runs.
  await page.addInitScript(() => {
    const w = window as unknown as { __name?: <T>(fn: T) => T };
    if (!w.__name) w.__name = (fn) => fn;
  });

  try {
    console.log(`  -> ${url}  (${slug})`);
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT_MS });
    const status = response?.status() ?? null;
    if (status && status >= 400) {
      throw new Error(`HTTP ${status}${status === 403 ? ' — bot-blocked? check USER_AGENT' : ''}`);
    }

    // Dismiss the cookie banner BEFORE settling/screenshotting so its overlay
    // colors never enter the sample.
    const consent = await dismissConsent(page);
    if (consent) console.log(`     dismissed consent overlay (${consent})`);

    await settle(page);
    if (AUTOSCROLL) { await autoScroll(page); await settle(page); }

    const data = await page.evaluate(extractInPage, CAPTURED_PROPS);

    await fs.writeFile(path.join(dir, 'computed-styles.json'), JSON.stringify(data.elements, null, 2));
    await fs.writeFile(path.join(dir, 'css-variables.json'), JSON.stringify(data.cssVariables, null, 2));
    await fs.writeFile(path.join(dir, 'stylesheets.css'), data.stylesheets);
    // Two screenshots, on purpose. Chromium's fullPage capture renders
    // position:fixed elements at most once and drops them from the top of the
    // stitched image — FormFactor's #site-header (fixed, z-index 6) is missing
    // from screenshot.png entirely. The viewport shot is the reliable record of
    // the header, primary nav and above-the-fold hero, which is exactly what P4
    // needs to read those components off.
    await page.screenshot({ path: path.join(dir, 'screenshot.png'), fullPage: true });
    await page.screenshot({ path: path.join(dir, 'screenshot-viewport.png'), fullPage: false });

    let stateCount = 0;
    if (CAPTURE_STATES) {
      const states = await captureStates(page, CAPTURED_PROPS);
      await fs.writeFile(path.join(dir, 'states.json'), JSON.stringify(states, null, 2));
      stateCount = states.length;
    }

    // Same-origin links for the optional follower (only when enabled).
    const links = FOLLOW_LINKS
      ? (await page.evaluate(() => Array.from(document.querySelectorAll('a[href]'), (a) => (a as HTMLAnchorElement).href)))
          .filter(isSameOrigin)
      : [];

    console.log(`     ok — ${data.elements.length} elements, ${Object.keys(data.cssVariables).length} :root vars${CAPTURE_STATES ? `, ${stateCount} stateful` : ''}`);
    return {
      result: {
        url, slug, finalUrl: page.url(), ok: true, status,
        elements: data.elements.length,
        cssVars: Object.keys(data.cssVariables).length,
        consent,
        crawledAt: new Date().toISOString(),
        error: null,
      },
      links,
    };
  } finally {
    await page.close();
  }
}

// --- Seeds -----------------------------------------------------------------

async function readSeeds(): Promise<string[]> {
  // Inline override — handy for crawling a single page (e.g. testing).
  const inline = process.env.FF_SEEDS;
  if (inline) {
    const urls = inline.split(/[\n,]/).map((l) => l.trim()).filter(Boolean);
    if (urls.length) { console.log(`Using FF_SEEDS (${urls.length} URL(s)).`); return urls; }
  }
  if (!(await fileExists(SEEDS_FILE))) {
    console.log(`No ${SEEDS_FILE} found — defaulting to BASE_URL only.`);
    return [BASE_URL];
  }
  const raw = await fs.readFile(SEEDS_FILE, 'utf8');
  const urls = raw.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  if (urls.length === 0) {
    console.log(`${SEEDS_FILE} has no active URLs (all commented) — defaulting to BASE_URL only.`);
    return [BASE_URL];
  }
  return urls;
}

// --- Manifest --------------------------------------------------------------

async function writeManifest(results: PageResult[], browserLabel: string): Promise<void> {
  const manifest = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    browser: browserLabel,
    viewport: { width: VIEWPORT_W, height: VIEWPORT_H },
    userAgent: USER_AGENT,
    followLinks: FOLLOW_LINKS,
    maxPages: MAX_PAGES,
    counts: {
      total: results.length,
      ok: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    },
    pages: results,
  };
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  console.log(`Manifest: ${path.relative(process.cwd(), MANIFEST_FILE)} — ${manifest.counts.ok} ok, ${manifest.counts.failed} failed`);
}

// --- Main ------------------------------------------------------------------

async function main(): Promise<void> {
  const { executablePath, label } = await resolveBrowser();
  console.log(`Browser: ${label} — ${HEADED ? 'headed' : 'headless'} @ ${VIEWPORT_W}x${VIEWPORT_H}`);
  const browser = await chromium.launch({ headless: !HEADED, executablePath });

  const results: PageResult[] = [];
  const crawled = new Set<string>();   // normalized URLs already visited
  const discovered: string[] = [];     // same-origin links seen on crawled pages

  try {
    const context = await browser.newContext({
      userAgent: USER_AGENT,
      viewport: { width: VIEWPORT_W ?? 1440, height: VIEWPORT_H ?? 900 },
      deviceScaleFactor: 1,
      locale: 'en-US',
      // Freeze CSS animations and scroll-reveal transitions so a screenshot
      // catches settled state rather than a random frame mid-transition.
      reducedMotion: 'reduce',
    });

    // Crawl one URL: dedup, record a manifest result, accumulate links.
    const run = async (url: string): Promise<void> => {
      const norm = normalizeUrl(url) ?? url;
      if (crawled.has(norm)) return;
      crawled.add(norm);
      try {
        const { result, links } = await crawlPage(context, url);
        results.push(result);
        discovered.push(...links);
      } catch (err) {
        const message = (err as Error).message;
        console.error(`  xx failed: ${url}\n     ${message}`);
        results.push({
          url, slug: slugify(url), finalUrl: '', ok: false, status: null,
          elements: 0, cssVars: 0, consent: null,
          crawledAt: new Date().toISOString(), error: message,
        });
      }
    };

    const seeds = await readSeeds();
    console.log(`Crawling ${seeds.length} seed(s) into ${path.relative(process.cwd(), OUTPUT_DIR)}/`);
    for (const url of seeds) await run(url);

    // Optional shallow, same-origin, depth-1 link following.
    if (FOLLOW_LINKS) {
      const seen = new Set<string>();
      const queue: string[] = [];
      for (const link of discovered) {
        const norm = normalizeUrl(link);
        if (!norm || crawled.has(norm) || seen.has(norm)) continue;
        seen.add(norm);
        queue.push(norm);
      }
      const budget = Math.max(0, MAX_PAGES - crawled.size);
      const toCrawl = queue.slice(0, budget);
      console.log(`Link-follow (depth 1): ${queue.length} same-origin candidate(s); crawling ${toCrawl.length} (cap ${MAX_PAGES}).`);
      if (queue.length > toCrawl.length) {
        console.log(`  (skipping ${queue.length - toCrawl.length} over the cap — raise FF_MAX_PAGES to include them.)`);
      }
      for (const url of toCrawl) await run(url);
    }

    await writeManifest(results, label);
    await context.close();
    console.log('Done.');
  } finally {
    await browser.close();
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
