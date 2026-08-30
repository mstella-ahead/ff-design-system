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
  - `--wpdm-*` — WP Download Manager
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
  seeds at 390×844 into `raw-mobile/`, and P5 added `crawl:tablet` (768×1024) and
  `crawl:laptop` (1280×800) so all four of the theme's bands are sampled rather
  than just the two extremes. Derive breakpoints and the responsive type scale
  from the deltas — but note the breakpoint *values* come from the theme's own
  utility suffixes, not from the diff.
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
raw-mobile/           # git-ignored — same, at 390x844  (band: base)
raw-tablet/           # git-ignored — same, at 768x1024 (band: -t)
raw-laptop/           # git-ignored — same, at 1280x800 (band: -sd)
tokens/               # W3C Design Tokens JSON (color, typography, spacing, radius,
                      #   shadow, breakpoints) + REPORT.md
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

## What P2 verified (2026-08-30) — read before P3/P4

The multi-page crawl surfaced five things the single-page smoke test could not.
Two of them will corrupt the tokens if ignored.

- **⚠️ The CookieYes preference-center stays mounted after the accept click, and
  it is 13.1% of the entire sample.** This corrects the P1 note above ("leaving
  it up costs ~11 elements"). Clicking `.cky-btn-accept` hides the *banner*, but
  `div.cky-modal` / `div.cky-preference-center` remain in the DOM with non-zero
  rects — **1095 of 8345 captured elements (~73/page)**. The damage is concrete:
  `rgb(33,33,33)` (`#212121`, CookieYes's own body text) ranks **4th in the raw
  palette at 885 occurrences and drops to zero** once these elements are
  excluded. CookieYes also themes itself with FormFactor's teal, inflating
  `#00a0af` from a true 115 to 175 (+52%), and `#000000` from 15 to 135.
  **P3 must drop any element whose `classes` or `path` contains `cky`.** Doing it
  in the analyzer (not the crawler) keeps the raw capture honest and re-filterable.
- **⚠️ Two paginated listing pages are 50.2% of all elements** — the press-release
  index (2206) and the blog index (1983) versus a 204-element events page. Raw
  frequency counts therefore describe *a press-release list item*, not FormFactor.
  **P3 must drive naming/tiering off page-spread, not raw count** (raw counts stay
  in `$extensions` for auditability). The existing `pages.size >= 3` core/extended
  tier is the one signal already robust to this; the spacing 0.5%-of-total
  threshold, the "most frequent font-size = base" rule and the top-10 `textStyle`
  combos are all skewed and need normalizing.
- **The `:root` layer is genuinely stable site-wide.** 173 vars present on all 15
  pages, **zero** vars whose *value* differs between pages. The 173→175 delta is
  only `--product-column-gap` + `--product-image-height` on product templates.
  So authored-name reconciliation in P3 rests on solid ground. Of the 173, 43 are
  unprefixed; one of those (`--wpdm-font`, WP Download Manager) is still vendor
  noise, so **42 are the theme's** — add `--wpdm-` to the filter list above.
- **`nav-item`'s geometry heuristic is broken — replace it with DOM ancestry.**
  The five real nav links are `nav#mega-menu > div.top-level > a.menu-item` at
  **h=16** (12px uppercase, no padding), so the `rect.h >= 18` bound excludes all
  five and the detector's only header hit is `a.site-header__logo` (h=68). Match
  on `site-header`/`mega-menu` in `path` instead. (Also: the real path has an
  intervening `div.top-level` that the P0 note omits.)
- **`card`'s `tag === 'div'` gate misses most cards.** Only 17 hits across 15
  pages. Rounded block-level elements are dominated by **`article` (59)**, and
  FormFactor's cards are `article.product-family-card` / `li.cta-card`. Widen to
  `article`/`li`/`section` and accept background-color as a surface signal, not
  just border/shadow.

Two P4/P6 hypotheses from CLAUDE.md now have answers:

- **The `link` detector's brand-hex keying is sound.** `#003a63` (`--primary`) is
  the link color: 1035 of ~1500 anchors. But **445 anchors are `#ffffff`**
  (footer / hero-on-dark) and the `isBrand` test misses them — an **inverse
  variant is missing** and should be added in P4. A further 44 anchors sit at
  `rgb(0,0,238)`, the browser default; these are *wrapper* anchors around images
  and cards (`a.site-header__logo`, `a.btn-inline` at 421×328, `a.whats-new-link`)
  whose inherited blue never paints visible text — latent, not visible drift, and
  not a palette entry.
- **~~Geometry is bimodal~~ — corrected in P3: "everything is a pill" holds.**
  The theme *declares* `--border-radius-regular: 3px` and `--border-radius-sm: 2px`,
  which looked like a bimodal split, but they are effectively dead: the only 2px
  and 4px instances in the whole crawl come from plugin defaults
  (`div.grecaptcha-badge`, `a.fl-button`, `input.frm_*`), never from theme markup.
  The real rule is one radius everywhere — see the P3 findings below.
- **Two-tone headings confirmed** on the homepage hero: "Semiconductor Test" in
  teal `--secondary` stacked directly above "and Measurement" in navy
  `--primary`, one sentence across two colors. Check it across templates in P6.
- **The modular scale reaches typography, not just spacing.** The hero is 67px =
  16 × 4.2 = `--size-900` exactly. Desktop shows a tight 13 distinct font sizes.

## What P3 established (2026-08-30)

`analyze.ts` gained four corrections; all of them changed the output.

- **Third-party overlay filtering (`isThirdPartyChrome`).** 1200 of 8345 elements
  (14.4%) dropped. CookieYes was the known offender; the crawl also turned up
  **WP Download Manager's `#wpdm-side-panel`**, one hidden instance per page
  styled in stock Tailwind slate, which had put `#0f172a`, `#1e293b` and
  `#64748b` into the palette as *core* tokens at a deceptive 15/15 page spread.
  BB PowerPack (`pp-*`/`fl-*`) and Formidable (`frm-*`) are deliberately **not**
  filtered — those plugins build FormFactor's real pages and forms.
- **Page-weighted scoring (`Tally`).** Every ranking now uses `spread` (how many
  templates) and `norm` (each page's observations sum to 1.0) instead of raw
  count. The clearest vindication is in type: **18px has 3116 raw occurrences vs
  16px's 3156 — near-tied — but norms of 3.46 vs 8.89**, because 18px is
  concentrated in the two listing templates. Raw counts stay in `$extensions`.
  - One trap found the hard way: `0px` is **92.9%** of all margin/padding
    observations, so including it in the normalization denominator starved every
    real value and collapsed the dominant set to four. Zero is a CSS default, not
    a design decision — `collectSpacing` now skips it and emits `space.0`
    explicitly.
- **Authored-name reconciliation.** 13 authored color vars. ~~8 load-bearing, 5
  declared-only~~ — **corrected in P4 after two crawler blind spots were fixed:
  11 are load-bearing and only 2 (`--secondary-light`, `--tertiary`) are truly
  declared-only.** `--orange` and `--purple` are painted by pseudo-elements and
  `--tertiary-dark` by a non-top border; all three were invisible to the crawler,
  not unused. See "What P4 established".
- **Vendor `:root` filtering.** 44 authored vars kept, 131 third-party filtered
  across 8 prefixes.

Two new categories that are observed but are *not* FormFactor's design language,
now separated rather than silently tokenized:

- **UA defaults** (`color.json` excludes them; REPORT lists them). `#0000ee` had
  been ranking 5th with a 15/15 spread purely because `a.site-header__logo`
  appears on every page. It is the *absence* of a color declaration, not a choice.
- **Social-platform colors** → `color.social.*`. `#1e75b4` / `#2bacdb` /
  `#2d3a8b` are LinkedIn/X/Facebook, appearing only as backgrounds on
  `a.share-link` in editorial templates. Needed to build a share row; not part of
  the brand palette.

### The palette that survived

Ordered by norm, and the top seven are *all* authored theme colors:

| Token | Hex | Norm | Role |
|---|---|---:|---|
| `dark-grey` | `#6f6a67` | 6.60 | **body text** — the most-used color on the site |
| `light` | `#ffffff` | 3.57 | surfaces + inverse text |
| `primary` ⭐ | `#003a63` | 3.46 | headings, links, primary buttons |
| `grey-secondary` | `#9c968d` | 0.65 | borders (128) + muted text (69) |
| `secondary` ⭐ | `#00a0af` | 0.31 | teal accent — **text only, never a background** |
| `dark` | `#003154` | 0.12 | **background only** (gradient endpoint / dark bands) |
| `yellow` | `#d2d755` | 0.06 | footer text, all 15 pages |

Carry into P6: **body text is a warm grey (`--dark-grey`), not navy or black**,
and **`--dark` is used exclusively as a background**. (The claim that
`--secondary` is text-only was an artifact of the missing pseudo-element pass —
it has 78 background uses, all on `::before`/`::after`. See P4.)

### Geometry — one radius, used everywhere

| Radius | Count | Carried by |
|---|---:|---|
| `30px` | 115 | `article` 59 (cards), `a` 22, `div` 18, `button` 15 |
| `20px` | 31 | form controls only — `input` 27, `select` 3, `textarea` 1 |
| `100%` | 9 | `a.share-link` (circular social buttons) |
| `30px 30px 0px 0px` | 15 | `a` — top-rounded card, 1/page |
| `0px 0px 30px 30px` | 2 | `div.footer` — bottom-rounded footer |
| `2px` / `4px` / `10px` / `40px` | 1–3 each | plugin defaults only, not theme markup |

So the same 30px applies to cards *and* buttons: it reads as a full pill on a
40px control and as a generously rounded rectangle on a 328px card. **There is no
sharp geometry in theme-authored UI.** Form fields are the one deliberate
exception at 20px.

### Scales

- **Spacing is a 1.334× modular scale**, reconstructed from the `--size-*`
  multipliers (which resolve as unevaluated strings like `1 * 1.33`). The
  observed values confirm it: 12 (Δ0), 16 (Δ0) and 21 (Δ0.3) carry the three
  highest norms. The "2px grid" the detector reports is an artifact of trying to
  read a grid off a multiplier scale — ignore it.
- **Type is Proxima Nova, base 16px, 13 sizes.** The modular scale reaches type
  but only partly: 16 (`--size-400`), 21 (`--size-500`), 28 (`--size-600`),
  38 (`--size-700`) and 67 (`--size-900`) map cleanly; 14, 18, 19, 25, 26, 30 and
  45 do not. The hero 67px appears on 13/15 pages.
- **Elevation barely exists.** Two shadows: `rgba(0,0,0,0.2) 0 4px 15px` (102×)
  and a lighter `rgba(0,0,0,0.1) 0 4px 20px` (15×). Three single-instance
  plugin shadows are held back as drift rather than named `lg`/`xl`/`2xl`, which
  would invent an elevation scale the site does not have.

## What P4 established (2026-08-30)

### Two crawler blind spots — found by looking at a screenshot

Both were invisible to every count and both required patching `crawl.ts` and
re-crawling. Neither would have been caught by staring at the numbers.

- **Pseudo-elements were never captured.** `querySelectorAll('*')` cannot see
  `::before`/`::after`, and this theme paints real brand color with them:
  `.page-header__body::after { height: 4px; background: var(--orange) }` is the
  orange rule under every page hero. It was visible in
  `raw/products-probe-cards/screenshot-viewport.png` while `--orange` was being
  reported as "declared but unused". The crawler now also reads
  `getComputedStyle(el, '::before'|'::after')` and keeps the generated elements
  that actually paint a background or border — **201 of 8546 elements (2.4%)**,
  carrying `--orange` (25), `--purple` (11), teal backgrounds (78, the active-nav
  underline and list bullets), `--grey` (12) and `--yellow` (11).
- **Only `border-top-width` was captured**, and all four border *colors* were
  gated on it — so a rule setting only `border-bottom` or `border-right` was
  invisible. `--tertiary-dark` ships as a `border-right-color` on an element whose
  top width is 0, on all 15 pages. The crawler now captures all four widths and
  the analyzer gates each side on its own.

Net effect: **11 of 13 authored colors are load-bearing, not 8.** The top 11
tokens by norm are now *all* authored theme colors, which is about as clean a
reconciliation as this exercise can produce.

### The detectors

Both heuristics CLAUDE.md flagged were wrong, and measurably so:

- **`nav-item`** bounded by `rect.y < 160 && rect.h >= 18`. The five real nav
  links are 12px uppercase with no padding, so their box is **h=16** — the bound
  excluded all five and the detector's only header hit was the logo. Now bounded
  by DOM ancestry (`site-header`/`mega-menu` in `path`), which is what we actually
  meant and is size-agnostic. 45 → 90 instances.
- **`card`** gated on `tag === 'div'`, missing FormFactor's cards entirely — they
  are `article.product-family-card` and `li.cta-card`, and `article` carries 59 of
  the 115 rounded surfaces. Now accepts article/li/section/div and treats
  background-color as a surface signal. **17 → 113 instances.**
- **`link`**'s brand-hex keying was sound but incomplete: 445 white anchors
  (footer, hero-on-dark) matched nothing. Now has an explicit inverse variant.
- **`button`** was picking `search-close` as its canonical example — a collapsed
  control parked at x=1510, off-canvas and 0px radius because it is hidden. The
  example picker now prefers on-canvas instances and breaks ties by painted area.
  Also excluded `a.skip-link.button`, which carries a `button` class but is an
  accessibility bypass link (17.6px, no radius).

12 components: hero, footer, cta-band, breadcrumb, card, tabs, form-field, table,
button, nav-item, heading, link. Each MDX carries purpose, when-to-use, a variant
table with token cross-links, hand-written canonical markup using the theme's real
class names (imagery always `placehold.co`), rules-and-gotchas, and the
most-representative observed instance with a screenshot region.

### The heading rule — the real brand signature

This supersedes the two-tone hypothesis in the P6 notes below.

~~Every heading level is teal.~~ **Corrected in P5** — that claim came from a
query that only counted headings *which were already teal*, so it could not see
the counter-examples. Measured properly, over all headings:

| Level | Teal | Navy | Other | Rule |
|---|---:|---:|---|---|
| h1 | **14** | 0 | — | absolute: always teal |
| h2 | **32** | 0 | white 7 (on dark) | teal, inverse on dark bands |
| h3 | 41 | **33** | grey 9 | mixed — depends on context |
| h4 | 4 | **12** | grey 3, white 1 | usually navy |

The resolving rule: **teal is the default heading color, and a heading that is
itself a link renders navy by inheritance.** Every navy `h3.heading`/`h4.heading`
sits inside a card or CTA item (`li.cta-card`, `ul.cta-grid`,
`article.featured-post`) and is wrapped in an `<a>`; one confirmed source rule is
`.product-family-card__product .product-name { color: var(--primary) }`. So a
heading that *labels* a section is teal; a heading that *is* a clickable card
title is navy. Body copy is warm grey `--dark-grey` (4104 text uses).

So the color system is role-based and unusually disciplined:

| Color | Exclusive role |
|---|---|
| `--secondary` teal | all headings h1–h4 |
| `--dark-grey` warm grey | body copy |
| `--primary` navy | links, nav, icons, button fills |
| `--dark` navy-black | backgrounds only |
| `--grey-secondary` | borders + muted text |
| `--orange` | the 4px rule under every hero (pseudo-element) |
| `--yellow` | footer accent |

**Two-tone headings are real but narrow** — narrower than CLAUDE.md's original
hypothesis (a site-wide signature) and broader than P4's first answer
(homepage-only). Resolved in P5 by finding every `<span>` nested in a heading
whose color differs from its parent's. Three genuine instances, on 2 of 15
templates, always *teal lead + navy emphasis*:

| Where | Element |
|---|---|
| Homepage hero | `h1.homepage-header__heading > span` |
| Homepage CTA panel | `h2 > span` in `.cta-box__heading` (2 spans) |
| Products category | `h3.category-heading > span` |

The apparent hits on `blog` and `company-news-events-press-releases` (10 and 25
navy spans in headings) are **not** two-tone: they are
`h3.year-tab > a.tab-link > span`, i.e. the link-inheritance rule above.

So the site-wide rule remains the simpler one — *the page title is always teal* —
with two-tone as a deliberate emphasis device used sparingly on landing pages.

### Composition system (feeds P6)

Layout is utility-driven off the modular scale, not ad-hoc margins:

- **`.flow > * + * { margin-top: var(--flow-space) }`** — the owl selector. All
  vertical rhythm comes from this one rule plus `.flow-space-{200..900}` modifiers
  that just reset `--flow-space` to a `--size-*` step.
- **`.radius { border-radius: var(--border-radius) }`** — one geometry utility,
  and because the var is breakpoint-conditional it is responsive for free.
- **`.shadow`** — the single elevation, `rgba(0,0,0,0.2) 0 4px 15px`.
- **`.section-padding` / `.default-padding`** escalate across four breakpoints
  (`--size-700` → `--size-800`×1.2 → `--size-900`×1.2 → `--size-major`×1.1).
- **`.wrapper`** is the max-width container (1433 outer → 1390 inner at 1440px).

### FormFactor's own breakpoints (feeds P5)

Read off the theme's utility suffixes rather than inferred from a diff — these are
the names the theme itself uses:

| Suffix | Media query | Meaning |
|---|---|---|
| _(none)_ | `< 480px` | mobile base |
| `-t` | `min-width: 480px` | tablet |
| `-sd` | `min-width: 1024px` | small desktop |
| `-hd` | `min-width: 1435px` | large desktop |

The CSS contains 11 distinct `min-width` values, but only these four are the
theme's; 576/601/768/769/783/992/1168/1200 come from Bootstrap, WordPress and
plugins. Note the desktop crawl at 1440px sits *just* above `-hd`.

Six authored vars change between 1440px and 390px: `--border-radius` 30px→**20px**,
`--logo-width` 340→224, `--wrapper-max-width` `calc(1390px + …)`→`65rem`,
`--footer-body-column-gap`/`-row-gap` calc→fixed, `--mega-menu-section-b` 280→265.

### Components that do not exist

Recorded rather than invented:

- **No pull quote.** Zero `<blockquote>` in all 15 templates, including the
  long-form blog post.
- **No spec table.** Exactly one `<table>` in the whole crawl (5 `th`, 20 `td`, on
  one industry page). The product detail page has none. CLAUDE.md predicted both;
  the data says no.

## What P5 established (2026-08-30)

### Four viewports, because the theme has four bands

The breakpoints are **read off the theme's own utility-class suffixes**, not
inferred from a viewport diff — `.flow-space-400`, `-400-t`, `-400-sd`, `-400-hd`
each live inside exactly one media query, so the theme names its own bands:

| Token | Min width | Suffix | Sampled |
|---|---:|---|---|
| `breakpoint.base` | 0 | _(none)_ | 390px (`raw-mobile/`) |
| `breakpoint.tablet` | 480 | `-t` | 768px (`raw-tablet/`) |
| `breakpoint.desktop` | 1024 | `-sd` | 1280px (`raw-laptop/`) |
| `breakpoint.wide` | 1435 | `-hd` | 1440px (`raw/`) |

The CSS holds 11 distinct `min-width` values; the other seven
(576/601/768/769/783/992/1168/1200) are Bootstrap, WordPress core and plugins and
must not become tokens. Note 1440px sits only 5px above `-hd`.

The two extra crawls were worth it — both findings below are invisible from a
390/1440 diff alone.

### The type scale has three effective steps, not four

768px and 1280px produce **identical** heading sizes at every level, so `-t` and
`-sd` share one type scale and only `-hd` steps up:

| Tag | 390 | 768 / 1280 | 1440 |
|---|---|---|---|
| h1 | 37.8 | 50.4 | **67.2** |
| h2 | 34.0 | 37.8 | 45.3 |
| h3 | 25.5 | 24.5 | 30.0 |
| h4 | 21.3 | 21.3 | 24.7 |

**Practical consequence: if you build one desktop layout, target `-hd`.** The
67.2px hero only exists at ≥1435px; anything narrower gets 50.4px.

And the responsive type scale is not a separate system — it walks the same
`--size-*` ladder one or two rungs at a time. Base is
`h1: calc(var(--size-700) * 1rem)`, escalating to `--size-800` then `--size-900`.

### Seven responsive vars, two of which are drift

- **`--border-radius`: 20px below 480px, 30px everywhere above.** Applied through
  the single `.radius` utility, so every card and button is responsive for free.
- `--logo-width`: 224 → 280 → 280 → 340.
- `--mega-menu-section-b` changes at `-sd`; `--footer-body-*-gap` only at `-hd`.
- **`--wrapper-max-width` dips at `-sd`** — three authored declarations: `65rem`
  (1040px), `calc(958px + …)` (~1001px), `calc(1390px + …)` (~1433px). The
  container is *narrower* at 1280px than at 768px. Almost certainly unintended;
  do not reproduce it.
- **`--product-image-height` is non-monotonic**: 150 → 178 → 150 → 242, three
  authored values reached through overlapping queries. Drift, not a scale.

### Layout: reflow, with the nav as a real exception

1280px and 1440px produce a **byte-identical element count** (8546 raw / 7286
after filtering), so `-sd` and `-hd` restyle the same markup rather than swapping
templates. Narrower widths shed elements progressively (−4.7% tablet, −16.3%
mobile) as secondary blocks are hidden.

Two structural exceptions:

- **The nav is genuinely swapped.** `.mobile-menu` exists alongside
  `nav#mega-menu`, with white-on-dark drill-down navigation
  (`.mobile-menu .col .menu-item { color: var(--light) }`, and
  `.col:not(.col-zero) { display: none }` so only the active column shows), plus a
  separate `.contact-us-button-mobile`. Confirmed against
  `raw-mobile/home/screenshot-viewport.png` — a hamburger replaces the five links.
- **75 pseudo-elements only paint at ≥1024px** (126 at 390/768 vs 201 at
  1280/1440), so some decorative rules are desktop-only.

Heading *color* does not change with viewport at all — only size. And the
homepage two-tone heading survives to 390px intact.

## Phases (checkpoint-driven — stop at each for review)

- **P0 — Scaffold + smoke test.** ✅ **DONE.** `npm install`, chromium present,
  `npm run typecheck` clean, and `FF_SEEDS=https://www.formfactor.com/ npm run crawl`
  produced `raw/home/` with all six artifacts: 339 elements, 173 `:root` vars,
  11 stateful elements, consent dismissed via `.cky-btn-accept`, HTTP 200.
  Re-run it yourself to confirm nothing has rotted before going further.
- **P1 — Single-page extract review.** ✅ **DONE** — findings are in the section
  above. The theme's authored vars are present and separable from the five
  categories of third-party noise. Nothing to redo; start at P2.
- **P2 — Multi-page crawl** over `seeds.txt`, then the mobile pass. ✅ **DONE**
  (2026-08-30). `seeds.txt` holds **15** URLs, not 16 — the earlier note was
  wrong. Both passes: **15 ok / 0 failed**, all 6 artifacts on every page
  (90 files desktop / 90 mobile, 44 MB + 28 MB). Findings that change P3/P4 are
  in "What P2 verified" above.
- **P3 — Analyze → tokens.** ✅ **DONE** (2026-08-30). `tokens/` holds
  color/typography/spacing/radius/shadow + `REPORT.md`; `npm run validate:tokens`
  passes (109 tokens, 2 aliases resolve). Authored-name reconciliation is in:
  `color.theme.*` uses FormFactor's own names and keeps the oklch name as
  `generatedName`. See "What P3 established" below.
- **P4 — Components.** ✅ **DONE** (2026-08-30). 12 components in
  `components/*.mdx` + an index with an honest-gaps section. Both flagged
  heuristics were measurably wrong and are fixed; two crawler blind spots were
  found and required a re-crawl. See "What P4 established" below.
- **P4 (original note, kept for context).** Cluster repeated elements + read them
  off screenshots → `components/*.mdx`. Two heuristics inherited from the
  internal-app version
  **need retuning here and are flagged in the code**: `nav-item` now bounds by
  `rect.y < 160` (top header bar) instead of a left sidebar, and the `link` /
  `button` variant detection keys off `FF_BRAND_HEXES`
  (`#003a63,#00a0af`) — verify FormFactor's link color is actually one of those
  before trusting the output. Expect this site to need components the app version
  never had: hero, card grid, spec table, breadcrumb, pull quote, form field,
  footer, CTA band.
- **P5 — Responsive.** ✅ **DONE** (2026-08-30). `tokens/breakpoints.json` +
  a Responsive section in `REPORT.md`. Crawled at **four** widths so every one of
  the theme's own bands is sampled, not just the two extremes:
  `npm run crawl:tablet` (768) and `npm run crawl:laptop` (1280) were added.
  `validate:tokens` passes (118 tokens across 6 files). See "What P5 established".
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

- Never commit any `raw*/` directory (`raw/`, `raw-mobile/`, `raw-tablet/`, `raw-laptop/`).
- Don't redistribute FormFactor's logos or photography. Use placeholders
  (e.g. `https://placehold.co/`) in any example markup.
- Never send scraped CSS/screenshots to third-party analyzers (Project Wallace,
  CSS Stats, etc.) — keep analysis local.
- Be a polite crawler: the seed list is small and the default is one page at a
  time. Don't turn on `FF_FOLLOW_LINKS` with a large `FF_MAX_PAGES` without a
  reason.
- Verify an artifact exists before assuming it does; this repo is built in stages
  and earlier phases may be incomplete.
