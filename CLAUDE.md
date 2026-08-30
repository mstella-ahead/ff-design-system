# FormFactor Design System Extraction

Reverse-engineer the design language of **www.formfactor.com** — colors first,
then typography, spacing, and components — into a versioned, referenceable design
system that lives in this repo and can be consumed by an agent building new
FormFactor-styled pages and prototypes.

FormFactor is a **public marketing site** built on WordPress (theme:
`formfactor-2022`). That's the one fact that shapes the architecture below, and
it differs from the internal-app version of this pipeline this repo was adapted
from (`~/Code/ahead-unity`): no SSO, no `auth.json`, no corporate-network
constraint — but bot filtering, cookie overlays, and a heavily *editorial* page
mix instead of an app's dense functional screens.

## Architecture — two stages, two scripts

1. **`scripts/crawl.ts`** — visits a curated set of pages and writes _raw_
   artifacts per page into `raw/`. Touches the network.
2. **`scripts/analyze.ts`** — reads `raw/` and produces the _distilled_ system:
   `tokens/` and `components/`. Touches no network.

They are deliberately separate. Analysis gets re-run constantly while tuning
clustering thresholds; crawling is slow. The split also enables drift detection
later: re-crawl on a schedule, re-analyze, diff `tokens/`.

## What was already verified before this repo was scaffolded

Don't re-derive these — they're checked, and a couple of them change the plan:

- **The origin blocks non-browser User-Agents.** `curl` with its default UA gets
  `HTTP 403`; the same request with a desktop Chrome UA gets `200`. `crawl.ts`
  pins a normal Chrome UA for exactly this reason. If pages start failing with
  403, that's the first thing to check.
- **The theme publishes its own `:root` design tokens.** This is the headline
  finding and it is *not* what the Unity build faced. From
  `wp-content/themes/formfactor-2022/style.css`:

  ```css
  :root {
    --primary: #003A63;   --dark: #003154;
    --secondary: #00A0AF; --secondary-light: #22b5d4;
    --tertiary: #4D7592;  --tertiary-dark: #336182;
    --light: #FFFFFF;     --grey: #E1E1E1;
    --dark-grey: #6F6A67; --grey-secondary: #9C968D;
    --orange: #F26728;    --purple: #7C2855;  --yellow: #D2D755;
    --base-size: 1;  --size-200 … --size-900, --size-major, --size-major-plus;
    --wrapper-max-width: 65rem;  --flow-space;  --gradient;
  }
  ```

  **Authored names beat generated ones.** The analyzer's auto-naming
  (`blue-500`-style, derived from oklch) is a fallback for sites that don't name
  their colors. Here, prefer FormFactor's own names and record the auto-name as
  an alias. Use the clustered computed styles to establish which of these vars
  are actually *load-bearing* versus declared-but-unused.
- **Beware the third-party variable noise — 173 `:root` vars are captured and
  only ~60 are FormFactor's.** Verified against `raw/home/css-variables.json`.
  Filter all of these before naming anything:
  - `--wp--*` / `--wp-*` — Gutenberg defaults (`#0693e3`, `#9b51e0`, `#f78da7`, …)
  - `--fa-*` — Font Awesome
  - `--frm-*` — Formidable Forms (calendar widget styling)
  - `--ss-*` — slim-select dropdown (`#5897fb`, `#dc3545`, …)
  - **`--color-*` / `--clr-*` — the BB PowerPack page-builder defaults, and the
    nastiest trap in the set.** `--color-primary` is `#4a8eff`, a generic
    Bootstrap-ish blue that is **not** FormFactor's `--primary: #003A63`. A
    name-based heuristic will grab the wrong one. Same for `--color-success`
    `#18ce0f`, `--color-info` `#2CA8FF`, `--color-warning` `#FFB236`,
    `--color-danger` `#ff5062`.

  The reliable signal is the *unprefixed* theme set: `--primary`, `--dark`,
  `--secondary`, `--tertiary`, `--light`, `--grey`, `--orange`, `--purple`,
  `--yellow`, `--size-*`, `--border-radius`, `--wrapper-max-width`, `--flow-space`,
  `--mega-menu-*`, `--logo-width`, `--footer-body-*`.
- **The type stack is Proxima Nova** (10 `font-family` declarations in the theme
  CSS resolve to it). Confirm the weights and the fallback chain from computed
  styles — the theme CSS alone won't tell you which weights actually ship.
- **Spacing is a modular scale, not a grid.** `--size-*` are multipliers off
  `--base-size: 1` (0.56 / 0.75 / 1 / 1.33 / 1.77 / 2.36 / 3.15 / 4.2 / 5.6 /
  7.5 — roughly a 1.33 ratio). These resolve as *unevaluated* strings like
  `1 * 0.56` because they're consumed inside `calc()`. Reconstruct the scale from
  the ratio, and cross-check against observed computed padding/margin values.
- **Read the computed values, not the theme source.** `style.css` declares
  `--wrapper-max-width: 65rem`, but the value that actually resolves at runtime is
  `calc( 1390px + 1 * 1.33 * 2rem )` — something later overrides it. That single
  discrepancy is the whole argument for this pipeline: the container is ~1390px,
  not 1040px. Also computed: `--border-radius: 30px` (which is why every button is
  a pill), `--logo-width: 340px`, `--mega-menu-height: 395px` / `-width: 740px`.
- **The consent banner is CookieYes** (`.cky-btn-accept`), and it mounts
  *asynchronously* — it is not in the DOM at `domcontentloaded`. `crawl.ts` waits
  for it and clicks it; the manifest records which selector fired. Leaving it up
  costs ~11 elements of non-brand styling in every page's sample.
- **`fullPage` screenshots drop the fixed header.** `#site-header` is
  `position: fixed; z-index: 6` and does not appear in Chromium's stitched
  full-page image. `crawl.ts` therefore writes *two* shots per page:
  `screenshot.png` (full page, for composition) and `screenshot-viewport.png`
  (above the fold — the only reliable record of the header, primary nav and hero).
  The computed styles are unaffected either way: `header#site-header` (y=0, h=92),
  the 340px logo and the five `nav#mega-menu > a.menu-item` links are all captured.
- **Every URL in `seeds.txt` returns 200** (checked 2026-08-30). One trap:
  `/news-events/press-releases/` 301s to `/company/news-events/press-releases/`,
  and the canonical form is what's in the seed list.

## Key decisions (and why)

- **Curated seed list, not a full crawl.** The sitemap has ~1,130 HTML URLs, but
  418 are press releases and 412 are blog posts — two templates, 830 pages. A
  design system needs _one of each kind_ of page, not hundreds of near-duplicates.
  Seeds live in `seeds.txt`, commented by archetype. Optional shallow same-origin
  link-following is capped and off by default (`FF_FOLLOW_LINKS=1`).
- **Computed styles are ground truth.** We read `getComputedStyle` on rendered
  elements rather than trusting source CSS, because a WordPress page is the sum
  of a theme, a page builder (`bbpowerpack`), a forms plugin (`formidable`),
  WooCommerce blocks and Font Awesome — the source is not the intent. We capture
  the `:root` vars and stylesheet text *as well*, because here they're real.
- **Dismiss the consent overlay before capturing.** A cookie banner sits on top
  of the page: it poisons the screenshot and injects its own non-brand colors
  into the computed-style sample. `crawl.ts` clicks it away first, best-effort,
  and records which selector worked in the manifest.
- **`reducedMotion: 'reduce'` + autoscroll.** Marketing pages lazy-load images
  and animate blocks in on scroll. We scroll the whole page to force render, and
  freeze transitions so screenshots catch settled state, not a random frame.
- **Responsive is a first-class concern here** in a way it wasn't for an internal
  app. The desktop pass writes `raw/`; `npm run crawl:mobile` re-runs the same
  seeds at 390×844 into `raw-mobile/`. Derive breakpoints and the responsive type
  scale from the delta between the two.
- **`raw/` is git-ignored.** It's someone else's markup, copy and photography.
  The repo ships the distilled system + the scripts, never the scrape.

## Repo layout

```
scripts/
  crawl.ts            # stage 1 — visit seeds, dump raw artifacts
  analyze.ts          # stage 2 — raw/ -> tokens/ + components/
  validate-tokens.ts  # sanity check on tokens/ (JSON, $type, alias resolution)
seeds.txt             # one URL per line — the curated page list, by archetype
raw/                  # git-ignored — per-page computed styles, css vars, css, png, states
raw-mobile/           # git-ignored — same, at 390x844
tokens/               # W3C Design Tokens JSON (color, typography, spacing, radius, shadow) + REPORT.md
components/           # one MDX file per component + README.md index
README.md             # entry point for humans + the consuming agent
CLAUDE.md             # this file
```

## Output conventions

- **Tokens**: W3C Design Tokens format (`$value` / `$type`), one file per
  category under `tokens/`. Provenance goes under
  `$extensions["com.formfactor.www"]` — observed frequency, role split
  (text/bg/border), oklch, merged raw colors, and which pages the token appears
  on, so every clustering decision is auditable.
- **Components**: one MDX file per component under `components/` — name, purpose,
  when-to-use, variants, a canonical example with real classes, a screenshot
  region reference, and the source pages where it appears.
- **Color clustering**: collapse near-duplicate colors (within a small perceptual
  ΔE) into a single token; record the raw members so the merge is auditable.
  Surface the histogram — the dominant handful is the real palette; the long tail
  is drift.

## Phases (checkpoint-driven — stop at each for review)

- **P0 — Scaffold + smoke test.** ✅ **DONE.** `npm install`, chromium present,
  `npm run typecheck` clean, and `FF_SEEDS=https://www.formfactor.com/ npm run crawl`
  produced `raw/home/` with all six artifacts: 339 elements, 173 `:root` vars,
  11 stateful elements, consent dismissed via `.cky-btn-accept`, HTTP 200.
  Re-run it yourself to confirm nothing has rotted before going further.
- **P1 — Single-page extract review.** ✅ **DONE** — findings are in the section
  above. The theme's authored vars are present and separable from the five
  categories of third-party noise. Nothing to redo; start at P2.
- **P2 — Multi-page crawl** over `seeds.txt`, then the mobile pass. ✅ when
  `raw/manifest.json` shows 16 ok / 0 failed, and `raw-mobile/` matches.
- **P3 — Analyze → tokens.** Cluster colors, derive type + spacing scales, emit
  `tokens/` + `REPORT.md`. **Reconcile against the authored `:root` names** —
  where a cluster matches an authored var, use FormFactor's name. ✅ when the
  palette reviews clean and `npm run validate:tokens` passes.
- **P4 — Components.** Cluster repeated elements + read them off screenshots →
  `components/*.mdx`. Two heuristics inherited from the internal-app version
  **need retuning here and are flagged in the code**: `nav-item` now bounds by
  `rect.y < 160` (top header bar) instead of a left sidebar, and the `link` /
  `button` variant detection keys off `FF_BRAND_HEXES`
  (`#003a63,#00a0af`) — verify FormFactor's link color is actually one of those
  before trusting the output. Expect this site to need components the app version
  never had: hero, card grid, spec table, breadcrumb, pull quote, form field,
  footer, CTA band.
- **P5 — Responsive.** Diff `raw/` vs `raw-mobile/` to derive breakpoints and the
  responsive type/spacing behavior. Record as `tokens/breakpoints.json` + a
  section in `REPORT.md`.
- **P6 — Finalize.** Write `README.md` as the entry point for the consuming
  agent, in the shape of `~/Code/ahead-design-system`: a short constitution of
  rules that must never break, a composition-pattern library, and an honest-gaps
  section. **This is the judgment layer and it is the point of the exercise** —
  the tokens are mechanical, the rules are not.

  Two candidate signatures to test while you're there, both visible in
  `raw/home/screenshot-viewport.png`:
  1. **Two-tone headings.** The hero reads "Semiconductor Test" in teal
     `--secondary` directly above "and Measurement" in navy `--primary`, as one
     sentence split across two colors. If that repeats across templates, it is
     FormFactor's equivalent of AHEAD's italic-serif emphasis — the one rule a
     prototype cannot break and still look like the brand.
  2. **Everything-is-a-pill.** `--border-radius: 30px` on a 40px-tall button is a
     full pill. Check whether cards and image blocks stay sharp (the bimodal
     geometry AHEAD uses) or also round off.

## Guardrails

- Never commit `raw/` or `raw-mobile/`.
- Don't redistribute FormFactor's logos or photography. Use placeholders
  (e.g. `https://placehold.co/`) in any example markup.
- Never send scraped CSS/screenshots to third-party analyzers (Project Wallace,
  CSS Stats, etc.) — keep analysis local.
- Be a polite crawler: the seed list is small and the default is one page at a
  time. Don't turn on `FF_FOLLOW_LINKS` with a large `FF_MAX_PAGES` without a
  reason.
- Verify an artifact exists before assuming it does; this repo is built in stages
  and earlier phases may be incomplete.
