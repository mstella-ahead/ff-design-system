# FormFactor Design System — Spec

*Reverse-engineered from the rendered pages of [www.formfactor.com](https://www.formfactor.com) — 15 page templates captured at four viewport widths, read from `getComputedStyle` rather than from source CSS, and reconciled against the `formfactor-2022` theme's own authored `:root` variables.*

*This is a **plausible reconstruction**. Where FormFactor named something, that name is used. Where it didn't, the name is generated and marked as such. The intent behind any given decision is inferred from evidence, never read from a brand book. §12 is the honest list of what this does not recover.*

---

## 1. Stack & architecture

- **Platform**: WordPress, theme `formfactor-2022`
- **Also loaded**: BB PowerPack page builder (`pp-*`/`fl-*`), Formidable Forms (`frm-*`), WooCommerce (breadcrumbs, product taxonomy), Font Awesome, CookieYes, WP Download Manager
- **CSS**: hand-authored theme CSS built on `:root` custom properties, with a small utility layer (`.flow`, `.radius`, `.shadow`, `.wrapper`, `.section-padding`)
- **Naming**: BEM-ish kebab-case with `__element` (e.g. `page-header__heading`, `product-family-card__grid`)

The important architectural fact: **the theme publishes its own design tokens.** 44 authored `:root` vars, identical in value on all 15 templates. That makes this system unusually recoverable — the names below are FormFactor's, not invented.

The counterpart fact: **131 of the 175 `:root` vars belong to third parties**, and one is a live trap. BB PowerPack defines `--color-primary: #4a8eff`, a generic blue that is *not* FormFactor's `--primary: #003A63`. Any name-based heuristic grabs the wrong one. Only the *unprefixed* set is the theme's.

## 2. Brand voice (visual)

The site reads as **clinical precision with a warm undertone** — appropriate for semiconductor metrology. Three devices carry it:

1. **Teal headings over warm-grey body copy.** Not navy-on-black. The page title is always teal; the prose beneath it is a warm grey (`#6F6A67`), not a cool one. That warm/cool pairing across heading and body is the least expected thing about the palette and the easiest to get wrong.
2. **Everything is a pill.** One 30px radius applies to buttons *and* cards *and* image blocks. On a 40px control it reads as a full pill; on a 328px card it reads as a generously rounded rectangle. There is no sharp-cornered surface in theme-authored UI.
3. **A 4px orange rule closing the hero.** The only appearance of `--orange` on the entire site, and it is painted by a pseudo-element. It's the one hot accent in an otherwise cool palette.

## 3. Color tokens

Ordered by page-weighted frequency. All eleven below are FormFactor's own authored names.

### Core palette

| Token | Hex | Role | Evidence |
|---|---|---|---|
| `--dark-grey` | `#6F6A67` | **Body copy.** The most-used color on the site. | 4113×, 15/15 pages, 4104 text uses |
| `--primary` | `#003A63` | Links, nav, icons, button fills. **Never a heading.** | 1936×, 15/15, 1845 text |
| `--light` | `#FFFFFF` | Surfaces, inverse text | 1015×, 15/15 |
| `--grey-secondary` | `#9C968D` | Borders (128) + muted text (69) | 201×, 15/15 |
| `--secondary` | `#00A0AF` | **All headings.** Teal. Also active-nav underline. | 200×, 15/15 |
| `--dark` | `#003154` | **Backgrounds only** — dark bands, gradient endpoint | 30×, 15/15, 0 text uses |
| `--yellow` | `#D2D755` | Footer accent, and nowhere else | 26×, 15/15 |
| `--orange` | `#F26728` | The 4px hero rule. Pseudo-element only. | 25×, 13/15 |
| `--tertiary-dark` | `#336182` | A `border-right` on one recurring element | 15×, 15/15 |
| `--grey` | `#E1E1E1` | Dividers, light fills | 18×, 4/15 |
| `--purple` | `#7C2855` | Decorative list markers. Pseudo-element only. | 11×, 7/15 |

### Declared but never rendered

`--secondary-light` `#22b5d4` and `--tertiary` `#4D7592`. Present in the stylesheet, referenced by rules whose selectors never matched in these 15 templates. **Available but unproven — do not build a palette on them.**

### Not FormFactor's colors

- **Social**: `#1e75b4` LinkedIn, `#2bacdb` X, `#2d3a8b` Facebook. Only ever backgrounds on `a.share-link`. Needed to build a share row; not part of the brand.
- **Generic greys**: `#555`, `#444`, `#333`, `#ccc` and a Bootstrap error red `#b94a48`, all confined to one or two templates. Plugin defaults. Drift.
- **`#0000EE`**: the browser's unstyled-link blue, on 44 wrapper anchors. The *absence* of a decision.

### The role rule

This is the part worth internalising, because it is unusually strict:

| Color | Exclusive role |
|---|---|
| teal `--secondary` | headings |
| warm grey `--dark-grey` | body copy |
| navy `--primary` | links, nav, icons, button fills |
| `--dark` | backgrounds |

Navy is never a heading; teal is never body copy; `--dark` is never text. The one apparent exception — navy card titles — is inheritance, not a recoloring: the heading *is* a link. See §5.

## 4. Typography

**Family**: Proxima Nova. One family, no serif, no mono. Fallback chain resolves through the theme's webfont loader.

**Weight**: 400 almost everywhere. 700 on button labels, 600 on top-level nav. **Size carries the hierarchy, not weight** — a 67px heading is still weight 400.

**Base size**: 16px.

### Heading scale — three effective steps

The `-t` (480px) and `-sd` (1024px) bands share one scale; only `-hd` (1435px) steps up.

| Element | < 480px | 480–1434px | ≥ 1435px | Authored as |
|---|---|---|---|---|
| `h1` | 37.8px | 50.4px | **67.2px** | `calc(var(--size-700…900) * 1rem)` |
| `h2` | 34.0px | 37.8px | 45.3px | `calc(var(--size-600…700) * 1.2rem)` |
| `h3` | 25.5px | 24.5px | 30.0px | `calc(var(--size-500…600) * 1.06–1.2rem)` |
| `h4` | 21.3px | 21.3px | 24.7px | `calc(var(--size-500) * 1–1.16rem)` |

The responsive type scale is **not a separate system** — it walks the same `--size-*` ladder one or two rungs at a time.

**Practical consequence: if you build one desktop layout, target ≥1435px.** The 67.2px hero exists only there; 1280px gets 50.4px.

## 5. Heading roles

| Element | Size (wide) | Color | Notes |
|---|---|---|---|
| `h1` | 67.2px | teal | **Always teal, 14/14 instances.** One per page, in the hero. |
| `h2` | 45.3px | teal (white on dark) | Section headings. Never navy. |
| `h3` | 30.0px | teal *or* navy | Teal when labelling a section; navy when it's a card/tab title |
| `h4` | 24.7px | usually navy | Mostly card titles |

**The teal/navy split resolves cleanly**: teal is the default, and a heading that is *itself a link* inherits navy from the anchor. Every navy `h3.heading`/`h4.heading` sits inside a card or CTA item wrapped in an `<a>`. One confirmed source rule: `.product-family-card__product .product-name { color: var(--primary) }`.

> A heading that **labels** a section is teal. A heading that **is** a clickable card title is navy.

### Two-tone headings

A deliberate emphasis device: **teal lead + navy `<span>`**. Used sparingly — three instances across two templates:

| Where | Element |
|---|---|
| Homepage hero | `h1.homepage-header__heading > span` |
| Homepage CTA panel | `h2 > span` in `.cta-box__heading` |
| Products category | `h3.category-heading > span` |

It survives to 390px intact. It is *not* a site-wide signature — do not put it on every page — but it is the strongest single gesture in the visual language, and it is what makes the homepage hero read as FormFactor's.

## 6. Spacing — a modular scale, not a grid

`--size-*` are **multipliers off `--base-size`, ratio 1.334 (4:3)**. They resolve as *unevaluated strings* (`--size-500` computes to `1 * 1.33`) because they are only ever consumed inside `calc()`.

| Var | Multiplier | px @16 |
|---|---:|---:|
| `--size-200` | 0.56 | 8.96 |
| `--size-300` | 0.75 | 12 |
| `--size-400` | 1 | 16 |
| `--size-500` | 1.33 | 21.28 |
| `--size-600` | 1.77 | 28.32 |
| `--size-700` | 2.36 | 37.76 |
| `--size-800` | 3.15 | 50.4 |
| `--size-900` | 4.2 | 67.2 |
| `--size-major` | 5.6 | 89.6 |
| `--size-major-plus` | 7.5 | 120 |

Observed spacing confirms it: 12 (Δ0), 16 (Δ0) and 21 (Δ0.3) carry the three highest page-weighted scores.

**Do not try to read an 8px grid off this.** A grid detector reports "2px", which is the signature of a multiplier scale, not a grid.

## 7. Geometry — one radius

| Radius | Applies to | Count |
|---|---|---:|
| **30px** | `article` (cards, 59), `a` (22), `div` (18), `button` (15) | 115 |
| **20px** | form controls only — `input` 27, `select` 3, `textarea` 1 | 31 |
| `100%` | circular social share buttons | 9 |
| `30px 30px 0 0` | card image meeting the card edge | 15 |
| `0 0 30px 30px` | the footer's top edge | 2 |

`--border-radius` drops to **20px below 480px**. Because the theme applies it through a single `.radius { border-radius: var(--border-radius) }` utility, every card and button is responsive with no per-component media query.

The theme also declares `--border-radius-regular: 3px` and `--border-radius-sm: 2px`. **Both are effectively dead** — every 2px/4px instance in the crawl comes from a plugin default (`grecaptcha`, `fl-button`, `frm_*`), never theme markup. Ignore them.

## 8. Elevation — barely exists

Two shadows, and no scale between them:

- `rgba(0,0,0,0.2) 0 4px 15px` — 102×, the default lift on cards and panels
- `rgba(0,0,0,0.1) 0 4px 20px` — 15×, a softer variant

Three further single-instance shadows come from plugins and are deliberately **not** tokenized; naming them `lg`/`xl`/`2xl` would invent an elevation system the site does not have.

## 9. Layout

- **Container**: `--wrapper-max-width` resolves to `calc(1390px + …)` ≈ **1433px** at ≥1435px, and ~1040px below. The theme *source* says `65rem`; the computed value is what ships. (See §12 for the `-sd` anomaly.)
- **Header**: `#site-header`, `position: fixed`, `z-index: 6`, 92px tall, 340px logo left / nav right.
- **Footer**: four columns (`.col-one`…`.col-four`), top corners rounded.
- **Reflow, not template-swap**: 1280px and 1440px produce a byte-identical element count. Narrower widths shed elements (−4.7% tablet, −16.3% mobile) as secondary blocks hide.
- **The nav is the real exception**: a separate `.mobile-menu` with white-on-dark drill-down replaces the mega-menu, plus a distinct `.contact-us-button-mobile`.

## 10. Breakpoints

Read off the theme's own utility-class suffixes — `.flow-space-400`, `-400-t`, `-400-sd`, `-400-hd` each live inside exactly one media query — so these are the bands FormFactor itself names:

| Token | Min width | Suffix |
|---|---:|---|
| `breakpoint.base` | 0 | *(none)* |
| `breakpoint.tablet` | 480 | `-t` |
| `breakpoint.desktop` | 1024 | `-sd` |
| `breakpoint.wide` | 1435 | `-hd` |

The CSS holds 11 distinct `min-width` values; the other seven (576, 601, 768, 769, 783, 992, 1168, 1200) are Bootstrap, WordPress core and plugins. **They are not FormFactor's and must not become tokens.**

---

## 11. Constitution — ten rules a prototype must not break

1. **Headings are teal. Body copy is warm grey.** `--secondary` `#00A0AF` for every heading; `--dark-grey` `#6F6A67` for prose. Not navy headings, not black body text. This single pairing does more to make a page read as FormFactor than anything else here.
2. **Navy is for links, nav, icons and button fills — never a heading.** The apparent exception (navy card titles) is a heading that *is* a link. If your heading isn't clickable, it's teal.
3. **Weight 400 everywhere.** 700 only on button labels, 600 on top-level nav. Hierarchy comes from size, never from bold. A 67px heading at weight 400 is correct and will look wrong to anyone expecting a bold hero.
4. **Everything rounds at 30px. Nothing is sharp.** Cards, buttons, image blocks, panels. Form fields are the *one* exception at 20px. There is no square-cornered surface in the system — do not "tighten" a card to 4px.
5. **Spacing is a 1.334 modular scale, not a grid.** Compose from `--size-*` steps (8.96 / 12 / 16 / 21.28 / 28.32 / 37.76 / 50.4 / 67.2 / 89.6 / 120). Never round to the nearest 8.
6. **Vertical rhythm comes from `.flow`, not from element margins.** `.flow > * + * { margin-top: var(--flow-space) }`, adjusted with a `flow-space-*` modifier. If you're setting `margin-bottom` on a heading, you've left the system.
7. **One shadow.** `rgba(0,0,0,0.2) 0 4px 15px`. There is no elevation scale; don't build one.
8. **The h1 is teal at the largest step, once per page, in the hero.** 67.2px at ≥1435px. Every template does this without exception.
9. **Two-tone headings are a scalpel, not a brush.** Teal lead + navy `<span>`, on a landing-page hero or a CTA panel. Three instances across fifteen templates. Using it on every heading would be as wrong as never using it.
10. **The hero closes with a 4px orange rule.** `--orange` `#F26728`, full width, `--size-700` above it. It's the only warm accent on the site and the only place that color appears — omit it and heroes look unfinished; repeat it elsewhere and it stops meaning anything.

### Two anti-rules

- **Don't use `--color-primary`.** That's BB PowerPack's `#4a8eff`, not FormFactor's navy. This is a real collision on the live site, not a hypothetical.
- **Don't copy `a.btn-inline`.** It looks like a button class; it's a 421×328 card-wrapper anchor with no color declared, rendering browser-default blue.

---

## 12. Honest gaps

What this reverse-engineering does **not** recover:

- **Motion.** `reducedMotion: 'reduce'` was set during capture *on purpose*, to get settled state rather than a random animation frame. Scroll-reveal and transition timings are therefore absent by design.
- **Hover, focus and active states.** They *are* captured, in `raw/<page>/states.json` via CDP `forcePseudoState`, but are not yet folded into the component docs or tokens. This is the largest known unfinished piece.
- **Mega-menu dropdowns in their open state.** The 740×395 panel and its contents are in the DOM and measured, but the crawl never hovers it open, so the dropdown's rendered appearance is inferred rather than seen.
- **No pull quote.** Zero `<blockquote>` across all 15 templates, including the long-form blog post. If a prototype needs one, it is being invented.
- **No spec table.** Exactly one `<table>` in the entire crawl (5 `th`, 20 `td`, on one industry page). The product detail page has none. There is no house table style to copy.
- **Iconography.** Inline SVGs sized and colored ad hoc, plus Font Awesome. No coherent icon system is visible in CSS alone.
- **Imagery rules.** Aspect ratios and crops are observable per instance, but the *rule* isn't. Note the hero background is heavily washed toward white so dark text stays legible — that treatment is a real pattern but its parameters aren't recoverable.
- **The `-sd` container anomaly.** `--wrapper-max-width` has three authored declarations resolving to 1040px, ~1001px and ~1433px, so the container is *narrower* at 1280px than at 768px. Almost certainly a bug in the theme. **Not reproduced** in `tokens.css`, which floors it at 1040px. Flagged rather than faithfully copied.
- **`--product-image-height` is non-monotonic** (150 → 178 → 150 → 242 across the four widths) through overlapping media queries. Drift, not a scale.
- **Editorial judgment.** Which sentence deserves a two-tone split; when a section earns a CTA panel; how long a card description runs. These are decisions a person made, and no amount of computed style recovers them.
- **Why.** Everything here is *what*, inferred from rendered output. The reasoning belongs to FormFactor's design team.

### A methodological gap worth knowing about

Two findings in this document were **invisible to the tooling until a screenshot was examined by eye**:

- `::before`/`::after` are unreachable by `querySelectorAll('*')`, so `--orange` and `--purple` looked like declared-but-unused vars while in fact painting on most pages. `crawl.ts` now reads pseudo-element styles explicitly; 201 of 8546 captured elements are generated content.
- Gating all four border *colors* on `border-top-width` hid `--tertiary-dark` entirely.

Both were caught by looking at a rendered page and noticing something the numbers didn't mention. **Treat any purely computed-style extraction as incomplete until it has been checked against an image.** That includes this one.
