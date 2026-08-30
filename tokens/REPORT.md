# FormFactor tokens — analysis report

Generated: 2026-08-30T19:17:52.400Z
Source: 15 pages under `raw/`

## How to read this report

Two properties of this particular crawl would produce a wrong palette if taken at face value, so both are corrected before anything is measured.

**1. Third-party overlay widgets are excluded.** **1260 of 8546 captured elements (14.7%) were dropped**; 7286 remain. Two widgets mount on every page and are never dismissed:

- **CookieYes** hides its banner on accept but leaves the preference-center modal mounted with real dimensions (~73 elements/page). Its own body text `#212121` ranked **4th** in the unfiltered palette on 885 occurrences and is not a FormFactor color at all. It is also themed in FormFactor's teal, which inflated the real `#00a0af` by ~52%.
- **WP Download Manager's side panel** contributes one hidden instance per page in stock Tailwind slate (`#0f172a`, `#1e293b`, `#64748b`) — three colors that otherwise entered the palette as *core* tokens at a deceptive 15/15 page spread.

BB PowerPack (`pp-*`/`fl-*`) and Formidable (`frm-*`) are deliberately **not** filtered: those plugins build FormFactor's real pages and forms.

**2. Frequencies are page-weighted, not raw.** The two paginated index templates (`company-news-events-press-releases` 2135, `blog` 1913) are **55.6% of all elements**, so a raw histogram describes a press-release list item rather than FormFactor. Every ranking below uses:

- **spread** — how many of the 15 page templates a value appears on. Immune to page size.
- **norm** — each page contributes one vote (its observations sum to 1.0), so all norms across a category sum to 15.

Raw counts are still recorded in every token's `$extensions` so each decision stays auditable.

**3. Pseudo-elements are captured.** `querySelectorAll('*')` cannot see `::before`/`::after`, but this theme paints real brand color with them — `.page-header__body::after` is the 4px orange rule under every page hero. The crawler therefore reads `getComputedStyle(el, '::before'|'::after')` too and keeps the 141 generated elements that actually paint a background or border. Without this pass `--orange` and `--purple` look like declared-but-unused vars when they are in fact rendered on most pages. Colors that *only* ever ship this way are marked `pseudoElementOnly`.

**4. Names are FormFactor's where FormFactor has one.** The theme publishes its own `:root` tokens, so clusters that match an authored var are named after it (`primary`, not `blue-800`) and live under `color.theme.*`. The oklch-derived name is retained as `generatedName`. Clusters with no authored match land in `color.palette.*`.

## Authored theme colors — load-bearing vs declared-only

The theme declares **13** color vars in `:root`. Being declared is not the same as being used, and the split is the useful part:


| Authored var | Hex | Observed? | Token | Count | Spread | Roles (txt/bg/bdr) |
|---|---|---|---|---:|---:|---|
| `--primary` | `#003a63` | ✅ yes | `color.theme.primary` | 1936 | 15/15 | 1845/91/0 |
| `--dark` | `#003154` | ✅ yes | `color.theme.dark` | 30 | 15/15 | 0/30/0 |
| `--secondary` | `#00a0af` | ✅ yes | `color.theme.secondary` | 200 | 15/15 | 122/78/0 |
| `--secondary-light` | `#22b5d4` | ⚪️ declared only | — | 0 | 0/15 | — |
| `--tertiary` | `#4d7592` | ⚪️ declared only | — | 0 | 0/15 | — |
| `--tertiary-dark` | `#336182` | ✅ yes | `color.theme.tertiary-dark` | 15 | 15/15 | 0/0/15 |
| `--light` | `#ffffff` | ✅ yes | `color.theme.light` | 1015 | 15/15 | 909/57/49 |
| `--grey` | `#e1e1e1` | ✅ yes | `color.theme.grey` | 18 | 4/15 | 0/12/6 |
| `--dark-grey` | `#6f6a67` | ✅ yes | `color.theme.dark-grey` | 4113 | 15/15 | 4104/9/0 |
| `--grey-secondary` | `#9c968d` | ✅ yes | `color.theme.grey-secondary` | 201 | 15/15 | 69/4/128 |
| `--orange` | `#f26728` | ◐ via `::before`/`::after` only | `color.theme.orange` | 25 | 13/15 | 0/25/0 |
| `--purple` | `#7c2855` | ◐ via `::before`/`::after` only | `color.theme.purple` | 11 | 7/15 | 0/11/0 |
| `--yellow` | `#d2d755` | ✅ yes | `color.theme.yellow` | 26 | 15/15 | 15/11/0 |

**2 declared-only:** `--secondary-light`, `--tertiary`. Present in the stylesheet but never resolved onto a rendered element in these 15 templates. Treat as available-but-unproven, not as part of the working palette.

## Palette

19 tokens clustered from 21 distinct observed colors (CIEDE2000 ΔE ≤ 2, seed min-count 2) — **14 core** (≥3 page templates) + **5 extended** (confined to 1–2 templates). Ordered by page-weighted norm.

### Core UI palette

⭐ brand mark · ◐ ships only via `::before`/`::after` · (social) routed to `color.social.*`, not FormFactor's palette

| Token | Source | Hex | Norm | Count | Roles (txt/bg/bdr) | Merged | Pages |
|---|---|---|---:|---:|---|---:|---:|
| `dark-grey` | `--dark-grey` | `#6f6a67` | 6.307 | 4113 | 4104/9/0 | 1 | 15 |
| `primary` ⭐ | `--primary` | `#003a63` | 3.522 | 1936 | 1845/91/0 | 1 | 15 |
| `light` | `--light` | `#ffffff` | 3.361 | 1015 | 909/57/49 | 1 | 15 |
| `grey-secondary` | `--grey-secondary` | `#9c968d` | 0.628 | 201 | 69/4/128 | 1 | 15 |
| `secondary` ⭐ | `--secondary` | `#00a0af` | 0.592 | 200 | 122/78/0 | 1 | 15 |
| `dark` ⭐ | `--dark` | `#003154` | 0.108 | 30 | 0/30/0 | 1 | 15 |
| `yellow` | `--yellow` | `#d2d755` | 0.084 | 26 | 15/11/0 | 1 | 15 |
| `orange` | `--orange` ◐ | `#f26728` | 0.081 | 25 | 0/25/0 | 1 | 13 |
| `tertiary-dark` | `--tertiary-dark` | `#336182` | 0.054 | 15 | 0/0/15 | 1 | 15 |
| `grey` | `--grey` | `#e1e1e1` | 0.049 | 18 | 0/12/6 | 2 | 4 |
| `purple` | `--purple` ◐ | `#7c2855` | 0.031 | 11 | 0/11/0 | 1 | 7 |
| `blue-600` | _blue-600_ (social) | `#1e75b4` | 0.009 | 3 | 0/3/0 | 1 | 3 |
| `blue-400` | _blue-400_ (social) | `#2bacdb` | 0.009 | 3 | 0/3/0 | 1 | 3 |
| `indigo-800` | _indigo-800_ (social) | `#2d3a8b` | 0.009 | 3 | 0/3/0 | 1 | 3 |

### Extended (accent / one-off)

| Token | Source | Hex | Norm | Count | Roles (txt/bg/bdr) | Merged | Pages |
|---|---|---|---:|---:|---|---:|---:|
| `neutral-700` | _neutral-700_ | `#555555` | 0.051 | 17 | 17/0/0 | 1 | 1 |
| `neutral-300` | _neutral-300_ | `#cccccc` | 0.041 | 13 | 1/0/12 | 1 | 2 |
| `orange-600` | _orange-600_ | `#b94a48` | 0.039 | 13 | 13/0/0 | 1 | 1 |
| `neutral-800` | _neutral-800_ | `#444444` | 0.015 | 5 | 5/0/0 | 1 | 1 |
| `neutral-800-2` | _neutral-800-2_ | `#333333` | 0.007 | 2 | 2/0/0 | 1 | 1 |

### Frequency, page-weighted (dominant → drift)

```
#6f6a67   6.307 ████████████████████████ dark-grey
#003a63   3.522 █████████████··········· primary
#ffffff   3.361 █████████████··········· light
#9c968d   0.628 ██······················ grey-secondary
#00a0af   0.592 ██······················ secondary
#003154   0.108 ························ dark
#d2d755   0.084 ························ yellow
#f26728   0.081 ························ orange
#336182   0.054 ························ tertiary-dark
#555555   0.051 ························ neutral-700
#e1e1e1   0.049 ························ grey
#cccccc   0.041 ························ neutral-300
#b94a48   0.039 ························ orange-600
#7c2855   0.031 ························ purple
#444444   0.015 ························ neutral-800
#1e75b4   0.009 ························ blue-600
#2bacdb   0.009 ························ blue-400
#2d3a8b   0.009 ························ indigo-800
#333333   0.007 ························ neutral-800-2
```

**Dominant vs drift:** the 14 core tokens are the real palette; the 5 extended tokens are accents confined to one or two templates. 1 near-duplicate shades were merged into their nearest token, and 1 rare one-off colors (count < 2) were dropped as drift.

## Unstyled elements (user-agent defaults)

These colors are *observed* on real FormFactor elements but are Chromium defaults, not choices — an element that was never given a color. They are excluded from the palette and listed here because they are latent bugs rather than tokens.


| Hex | What it is | Count | Pages | Selectors |
|---|---|---:|---:|---|
| `#0000ee` | UA unstyled-link blue | 169 | 15/15 | `<path>` (45), `[` (21), `btn-inline` (18), `product-image` (18) |

Mostly harmless in practice: these are *wrapper* anchors around images and whole cards (`a.site-header__logo` wraps the logo SVG; `a.btn-inline` is a 421×328 card link), so the inherited blue never paints visible text. It is latent, not visible — but any bare text node added inside one would render browser-blue.

## `:root` variables

**44 authored** theme vars, after filtering **131** third-party vars. The theme names its own vars *unprefixed*, which is what makes them separable:


| Vendor prefix | Vars filtered | Why it must be filtered |
|---|---:|---|
| `--wp--*` | 49 | Gutenberg / core block defaults |
| `--color-*` | 25 | **BB PowerPack — `--color-primary` is `#4a8eff`, NOT FormFactor's `#003A63`** |
| `--ss-*` | 17 | slim-select dropdown |
| `--frm-*` | 12 | Formidable Forms |
| `--wp-*` | 12 | Gutenberg / core block defaults |
| `--fa-*` | 11 | Font Awesome |
| `--clr-*` | 4 | BB PowerPack |
| `--wpdm-*` | 1 | WP Download Manager |

Authored theme vars:

```
--base-size: 1
--border-radius: 30px
--border-radius-regular: 3px
--border-radius-sm: 2px
--dark: #003154
--dark-grey: #6F6A67
--flow-space: calc( 1 * 1.33 * 1rem )
--font-size-lg: 16px
--font-size-sm: 12px
--footer-body-column-gap: calc( 1 * 2.36 * 1rem )
--footer-body-columns: 3
--footer-body-row-gap: calc( 1 * 3.15 * 1rem )
--gradient: linear-gradient(90deg, #003A63 0%, #003154 100%)
--grey: #E1E1E1
--grey-secondary: #9C968D
--light: #FFFFFF
--logo-width: 340px
--mega-menu-height: 395px
--mega-menu-section-a: 180px
--mega-menu-section-b: 280px
--mega-menu-section-c: 280px
--mega-menu-width: 740px
--orange: #F26728
--padding-regular: 6px 15px
--primary: #003A63
--product-column-gap: 0
--product-image-height: 242px
--purple: #7C2855
--secondary: #00A0AF
--secondary-light: #22b5d4
--size-200: 1 * 0.56
--size-300: 1 * 0.75
--size-400: 1
--size-500: 1 * 1.33
--size-600: 1 * 1.77
--size-700: 1 * 2.36
--size-800: 1 * 3.15
--size-900: 1 * 4.2
--size-major: 1 * 5.6
--size-major-plus: 1 * 7.5
--tertiary: #4D7592
--tertiary-dark: #336182
--wrapper-max-width: calc( 1390px + 1 * 1.33 * 2rem )
--yellow: #D2D755
```

## Typography

Primary font: `"Proxima Nova"`
Base size: **16px** (highest page-weighted norm).

13 distinct font sizes:

| px | Norm | Count | Spread | | Authored step |
|---:|---:|---:|---:|---|---|
| 14 | 1.788 | 458 | 15/15 | `███·············` | — |
| 16 | 9.055 | 3289 | 15/15 | `████████████████` | `--size-400` (16px) |
| 18 | 3.373 | 3116 | 15/15 | `██████··········` | — |
| 19 | 0.208 | 91 | 3/15 | `················` | — |
| 20 | 0.029 | 9 | 3/15 | `················` | `--size-500` (21.28px) |
| 21 | 0.007 | 2 | 1/15 | `················` | `--size-500` (21.28px) |
| 25 | 0.093 | 25 | 5/15 | `················` | — |
| 26 | 0.034 | 8 | 7/15 | `················` | — |
| 28 | 0.011 | 3 | 1/15 | `················` | `--size-600` (28.32px) |
| 30 | 0.214 | 231 | 9/15 | `················` | — |
| 38 | 0.008 | 2 | 1/15 | `················` | `--size-700` (37.76px) |
| 45 | 0.125 | 38 | 6/15 | `················` | — |
| 67 | 0.055 | 14 | 13/15 | `················` | `--size-900` (67.2px) |

Font weights:

| Weight | Norm | Count | Spread |
|---:|---:|---:|---:|
| 400 | 11.790 | 6461 | 15/15 |
| 900 | 1.185 | 300 | 15/15 |
| 600 | 1.067 | 270 | 15/15 |
| 700 | 0.934 | 246 | 15/15 |
| 800 | 0.024 | 9 | 1/15 |

## Spacing

### The authored modular scale (`--size-*`)

The theme's `--size-*` vars form a consistent **1.334× modular scale** off `--base-size` — not an 8px grid. They resolve as *unevaluated* strings (`--size-500` computes to `1 * 1.33`) because they are only ever used inside `calc()`, so the multipliers are parsed rather than read as px.


| Var | Expression | Multiplier | px @16 |
|---|---|---:|---:|
| `--size-200` | `1 * 0.56` | 0.56 | 8.96 |
| `--size-300` | `1 * 0.75` | 0.75 | 12 |
| `--size-400` | `1` | 1 | 16 |
| `--size-500` | `1 * 1.33` | 1.33 | 21.28 |
| `--size-600` | `1 * 1.77` | 1.77 | 28.32 |
| `--size-700` | `1 * 2.36` | 2.36 | 37.76 |
| `--size-800` | `1 * 3.15` | 3.15 | 50.4 |
| `--size-900` | `1 * 4.2` | 4.2 | 67.2 |
| `--size-major` | `1 * 5.6` | 5.6 | 89.6 |
| `--size-major-plus` | `1 * 7.5` | 7.5 | 120 |

### Observed spacing

Inferred base grid: **2px** (71% of page-weighted spacing values are multiples).

**28 dominant values** (norm ≥ 0.5% of the page-weighted total):

| px | Norm | Count | Spread | Nearest authored step |
|---:|---:|---:|---:|---|
| 4 | 0.677 | 151 | 15/15 | `--size-200` (8.96px, Δ5.0) |
| 5 | 0.227 | 67 | 15/15 | `--size-200` (8.96px, Δ4.0) |
| 6 | 0.230 | 55 | 5/15 | `--size-200` (8.96px, Δ3.0) |
| 8 | 0.599 | 143 | 15/15 | `--size-200` (8.96px, Δ1.0) |
| 10 | 0.703 | 195 | 15/15 | `--size-200` (8.96px, Δ1.0) |
| 12 | 1.759 | 357 | 15/15 | `--size-300` (12px, Δ0.0) |
| 13 | 0.077 | 12 | 2/15 | `--size-300` (12px, Δ1.0) |
| 15 | 0.204 | 70 | 4/15 | `--size-400` (16px, Δ1.0) |
| 16 | 1.807 | 394 | 15/15 | `--size-400` (16px, Δ0.0) |
| 18 | 0.192 | 52 | 3/15 | `--size-400` (16px, Δ2.0) |
| 19 | 0.091 | 34 | 5/15 | `--size-500` (21.28px, Δ2.3) |
| 20 | 1.188 | 299 | 15/15 | `--size-500` (21.28px, Δ1.3) |
| 21 | 2.611 | 1135 | 15/15 | `--size-500` (21.28px, Δ0.3) |
| 24 | 0.304 | 62 | 15/15 | `--size-500` (21.28px, Δ2.7) |
| 26 | 0.087 | 32 | 3/15 | `--size-600` (28.32px, Δ2.3) |
| 28 | 0.352 | 95 | 9/15 | `--size-600` (28.32px, Δ0.3) |
| 30 | 0.629 | 133 | 15/15 | `--size-600` (28.32px, Δ1.7) |
| 32 | 0.112 | 32 | 4/15 | `--size-600` (28.32px, Δ3.7) |
| 38 | 0.163 | 36 | 15/15 | `--size-700` (37.76px, Δ0.2) |
| 40 | 0.323 | 164 | 15/15 | `--size-700` (37.76px, Δ2.2) |
| 49 | 0.374 | 77 | 15/15 | `--size-800` (50.4px, Δ1.4) |
| 50 | 0.487 | 140 | 15/15 | `--size-800` (50.4px, Δ0.4) |
| 54 | 0.300 | 62 | 15/15 | `--size-800` (50.4px, Δ3.6) |
| 60 | 0.465 | 112 | 14/15 | `--size-900` (67.2px, Δ7.2) |
| 81 | 0.167 | 45 | 12/15 | `--size-major` (89.6px, Δ8.6) |
| 90 | 0.099 | 23 | 14/15 | `--size-major` (89.6px, Δ0.4) |
| 92 | 0.103 | 21 | 15/15 | `--size-major` (89.6px, Δ2.4) |
| 99 | 0.347 | 85 | 15/15 | `--size-major` (89.6px, Δ9.4) |

Long tail (23 rare / off-scale values, flagged not tokenized): 1, 2, 3, 9, 11, 25, 29, 31, 34, 44, 51, 55, 58, 59, 67, 83, 88, 110, 120, 237, 330, 365, 552

## Border radius

| Radius | Count | Carried by (tag.class → count) |
|---|---:|---|
| `100%` | 9 | `a.share-link` 9 |
| `2px` | 2 | `input` 1, `div.grecaptcha-badge` 1 |
| `4px` | 3 | `a.fl-button` 1, `input.frm_final_submit` 1, `input.frm_form_field` 1 |
| `10px` | 1 | `table` 1 |
| `20px` | 31 | `input` 26, `select` 3, `input.auto_width` 1, `textarea` 1 |
| `30px` | 115 | `article.[` 59, `a.[` 22, `div.[` 18, `button.[` 15 |
| `40px` | 3 | `div.pp-tabs-labels` 2, `div.[` 1 |

- Compound / per-corner: `30px 30px 0px 0px` (15×) — `a.[` 15
- Compound / per-corner: `0px 0px 30px 30px` (2×) — `div.footer` 2

## Responsive

Captured at 4 widths: **390px** (`raw-mobile/`, base), **768px** (`raw-tablet/`, tablet), **1280px** (`raw-laptop/`, desktop), **1440px** (`raw/`, wide).

### FormFactor's breakpoints

Read off the theme's own utility-class suffixes, not inferred from a viewport diff. `formfactor-2022` ships `.flow-space-400`, `-400-t`, `-400-sd` and `-400-hd`, and each suffixed variant lives inside exactly one media query — so these are the breakpoints the theme itself names.


| Token | Min width | Suffix | Band | Sampled |
|---|---:|---|---|---|
| `breakpoint.base` | 0px | _(none)_ | mobile base | 390px |
| `breakpoint.tablet` | 480px | `-t` | tablet | 768px |
| `breakpoint.desktop` | 1024px | `-sd` | small desktop | 1280px |
| `breakpoint.wide` | 1435px | `-hd` | large desktop | 1440px |

The CSS contains 11 distinct `min-width` values, but only these four are FormFactor's. The other seven (576, 601, 768, 769, 783, 992, 1168, 1200) come from Bootstrap, WordPress core and plugins, and must not become tokens.

### Authored vars that change with viewport

**7** of the authored vars resolve differently across widths. These are the real responsive tokens.


| Var | 390px | 768px | 1280px | 1440px |
|---|---|---|---|---|
| `--border-radius` | `20px` | `30px` | `30px` | `30px` |
| `--footer-body-column-gap` | `40px` | `40px` | `40px` | `calc( 1 * 2.36 * 1rem )` |
| `--footer-body-row-gap` | `38px` | `38px` | `38px` | `calc( 1 * 3.15 * 1rem )` |
| `--logo-width` | `224px` | `280px` | `280px` | `340px` |
| `--mega-menu-section-b` | `265px` | `265px` | `280px` | `280px` |
| `--product-image-height` | `150px` | `178px` | `150px` | `242px` |
| `--wrapper-max-width` | `65rem` | `65rem` | `calc( 958px + 1 * 1.33 * 2rem )` | `calc( 1390px + 1 * 1.33 * 2rem )` |

The headline one is `--border-radius`: **20px below 480px, 30px everywhere above**. Because the theme applies it through a single `.radius { border-radius: var(--border-radius) }` utility, every card and button becomes responsive for free — there is no per-component media query to maintain.

Two of these are worth flagging rather than tokenizing as-is:

- **`--wrapper-max-width` dips at `-sd`.** Three authored declarations exist: `65rem` (1040px), `calc(958px + var(--size-500) * 2rem)` (~1001px) and `calc(1390px + …)` (~1433px). So the container is *narrower* at 1280px than at 768px. That is almost certainly unintended, and a prototype should not reproduce it — treat ~1000px as a floor, not a design intent.
- **`--product-image-height` is non-monotonic**: 150px at 390, 178px at 768, back to 150px at 1280, then 242px at 1440. Three authored values (150/178/242) reached through overlapping queries. Drift, not a scale.

### Responsive type scale

Heading sizes per viewport (distinct values observed, px). Color does not change with viewport — only size.


| Tag | 390px | 768px | 1280px | 1440px |
|---|---|---|---|---|
| `h1` | 37.8 | 50.4, 37.8 | 50.4, 37.8 | 67.2, 37.8 |
| `h2` | 34, 25.5 | 37.8, 24.5 | 37.8, 24.5 | 45.3, 30 |
| `h3` | 25.5, 21.3, 19.2, 18 | 24.5, 21.3, 19.2, 18 | 24.5, 21.3, 19.2, 18 | 30, 28.3, 24.7, 18 |
| `h4` | 21.3 | 21.3 | 21.3 | 24.7 |

The scale is authored as a per-level multiplier on the modular scale, escalating a step or two per breakpoint. From the theme CSS:

```css
/* base (mobile) */
h1 { font-size: calc( var(--size-700) * 1rem   ) }  /* 37.8px */
h2 { font-size: calc( var(--size-600) * 1.2rem ) }  /* 34.0px */
h3 { font-size: calc( var(--size-500) * 1.2rem ) }  /* 25.5px */
h4 { font-size: calc( var(--size-500) * 1rem   ) }  /* 21.3px */

/* escalating at -t / -sd / -hd */
h1 { font-size: calc( var(--size-800) * 1rem   ) }  /* 50.4px */
h1 { font-size: calc( var(--size-900) * 1rem   ) }  /* 67.2px */
h2 { font-size: calc( var(--size-700) * 1.2rem ) }  /* 45.3px */
h3 { font-size: calc( var(--size-600) * 1.06rem) }  /* 30.0px */
```

So the responsive type scale is not a separate system: it walks the same `--size-*` ladder, one or two rungs at a time.

**The type scale has three effective steps, not four.** 768px and 1280px produce identical heading sizes at every level, so the `-t` and `-sd` bands share one type scale and only `-hd` (1435px) steps up. If you are building a single desktop layout, target `-hd` — that is where the 67.2px hero lives, and anything narrower than 1435px gets the 50.4px h1 instead.

### Layout


| Width | Elements | vs widest | Notes |
|---:|---:|---:|---|
| 390px | 6101 | -16.3% | mobile base |
| 768px | 6947 | -4.7% | tablet |
| 1280px | 7286 | +0.0% | small desktop |
| 1440px | 7286 | +0.0% | large desktop |

The site **reflows rather than swapping templates**: 1280px and 1440px produce a byte-identical element count, so the `-sd` and `-hd` bands restyle the same markup rather than replacing it. Narrower widths shed elements progressively (-4.7% at tablet, -16.3% at mobile) as decorative and secondary blocks are hidden.

Two structural exceptions:

- **The nav is genuinely swapped, not reflowed.** A separate `.mobile-menu` exists alongside `nav#mega-menu`, with its own white-on-dark drill-down (`.mobile-menu .col .menu-item { color: var(--light) }`, and `.col:not(.col-zero) { display: none }` so only the active column shows). There is also a distinct `.contact-us-button-mobile`. Verified against `raw-mobile/home/screenshot-viewport.png`, which shows a hamburger in place of the five top-level links.
- **75 pseudo-elements only paint at ≥1024px** (126 at 390/768 vs 201 at 1280/1440), so some decorative rules — including part of the orange-rule treatment — are desktop-only.

## Shadows

**2 elevation token(s).** FormFactor barely uses shadow — there is no graduated elevation scale, just one common lift and a lighter variant.

- (102×) `rgba(0, 0, 0, 0.2) 0px 4px 15px 0px`
- (15×) `rgba(0, 0, 0, 0.1) 0px 4px 20px 0px`

Held back as drift (single-instance, single-page, plugin-authored — naming these would invent an elevation scale the site does not have): `rgb(128, 128, 128) 0px 0px 5px 0px` (1×); `rgb(238, 238, 238) 0px 1px 1px 0px` (1×); `rgba(18, 18, 23, 0.05) 0px 1px 2px 0px` (1×)
