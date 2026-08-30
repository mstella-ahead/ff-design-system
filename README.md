# FormFactor Design System

A versioned, machine-readable distillation of the design language of
**www.formfactor.com**, extracted from the live, rendered site and shaped into
**design tokens** and **component specs** that an agent can consume when building
new FormFactor-styled pages and prototypes.

It is reverse-engineered from *computed styles* (ground truth), cross-checked
against the theme's own authored `:root` variables. For the architecture and the
reasoning behind every decision, see [`CLAUDE.md`](./CLAUDE.md). This file is the
**entry point**: what's here and how to use it.

> **Status: scaffold, pipeline verified.** `npm run typecheck` is clean and a
> single-page smoke crawl of the homepage succeeds end to end (339 elements, 173
> `:root` vars, 11 stateful elements, consent banner dismissed). `tokens/` and
> `components/` do not exist yet — run the phases in `CLAUDE.md` to populate them.

---

## What's here now

```
scripts/
  crawl.ts            stage 1 — visit seeds, dump raw artifacts   (touches network)
  analyze.ts          stage 2 — raw/ → tokens/ + components/      (no network)
  validate-tokens.ts  sanity check on tokens/
seeds.txt             the curated page list — 16 pages, one per archetype
CLAUDE.md             architecture, verified findings, phased build plan
```

And what the pipeline will produce:

```
raw/           git-ignored — per-page computed styles, CSS vars, CSS, two
               screenshots (full-page + above-the-fold), and states.json
               (:hover/:focus/:active deltas)
raw-mobile/    git-ignored — the same seeds at 390x844
tokens/        W3C Design Tokens — color, typography, spacing, radius, shadow + REPORT.md
components/    one MDX per component — purpose, variants, canonical example
```

---

## The system at a glance

Everything below comes from the theme's own `:root` variables as they *compute*
on the live homepage (`raw/home/css-variables.json`). Treat it as the starting
hypothesis the full crawl confirms or corrects — the clustering across all 16
seeds is what establishes which of these are load-bearing and which are declared
but unused.

| Aspect | Value |
|---|---|
| **Brand primary** | `#003A63` — deep navy (`--primary`) |
| **Brand secondary** | `#00A0AF` — teal (`--secondary`), light `#22b5d4` |
| **Tertiary** | `#4D7592` / `#336182` — muted slate blues |
| **Neutrals** | white `#FFFFFF`, `#E1E1E1`, `#6F6A67`, `#9C968D` (warm greys) |
| **Accents** | orange `#F26728`, purple `#7C2855`, yellow `#D2D755` |
| **Font** | Proxima Nova |
| **Spacing** | modular scale off `--base-size`, ~1.33 ratio (0.56 → 7.5) |
| **Container** | ~1390px + gutters (the theme source says `65rem`; the *computed* value is `calc(1390px + 1 * 1.33 * 2rem)`) |
| **Radius** | `--border-radius: 30px` — buttons render as full pills |
| **Platform tells** | WordPress + `formfactor-2022` theme, BB PowerPack page builder, Formidable Forms, Font Awesome 6.4.2 |

The warm greys (`#6F6A67`, `#9C968D`) sitting next to cool navy/teal is an
unusual pairing and worth confirming in P3 — it may be a real signature or it may
be legacy drift.

---

## Regenerating

```bash
npm install
npx playwright install chromium

# Smoke test — one page.
FF_SEEDS=https://www.formfactor.com/ npm run crawl

# Stage 1 — crawl all seeds (desktop, then mobile).
npm run crawl
npm run crawl:mobile

# Stage 2 — distill raw/ into tokens/ + components/ (no network; re-run freely).
npm run analyze

# Sanity-check the emitted tokens.
npm run validate:tokens
```

**Crawl knobs** (env): `FF_BASE_URL`, `FF_SEEDS` (comma/newline list — crawl just
these), `FF_OUTPUT_DIR`, `FF_VIEWPORT` (`WxH`), `FF_NAV_TIMEOUT_MS`,
`FF_SETTLE_MS`, `FF_DOM_QUIET_MS`, `FF_DOM_MAX_MS`, `FF_AUTOSCROLL=0`,
`FF_CAPTURE_STATES=0`, `FF_MAX_STATE_TARGETS`, `FF_CONSENT_TIMEOUT_MS`,
`FF_FOLLOW_LINKS=1`, `FF_MAX_PAGES`, `FF_HEADED=1`, `FF_BROWSER_PATH`.

**Analyze knobs:** `ANALYZE_COLOR_DELTA` (cluster tightness),
`ANALYZE_COLOR_MIN_COUNT`, `FF_BRAND_HEXES`.

> The site blocks non-browser User-Agents — `crawl.ts` pins a desktop Chrome UA.
> If every page starts returning 403, check that first.

> Two screenshots per page, on purpose: Chromium's `fullPage` capture drops the
> fixed `#site-header`, so `screenshot-viewport.png` is the reliable record of the
> header, primary nav and above-the-fold hero. Use it when reading components.

---

## Provenance

Adapted from `~/Code/ahead-unity`, which runs the same two-stage pipeline against
an internal SSO-protected app. The auth stage is removed here; consent-overlay
dismissal, a pinned User-Agent, reduced-motion capture and a mobile pass are
added. The output shape to aim for — constitution, composition patterns, honest
gaps — is modeled on `~/Code/ahead-design-system`.

This is a reverse-engineered reference repo built from a public website. It ships
tokens and specs, never the scrape, and never FormFactor's logos or photography.
