# FormFactor tokens — analysis report

Generated: 2026-08-30T18:36:25.043Z
Source: 15 pages under `raw/`

## How to read this report

Two properties of this particular crawl would produce a wrong palette if taken at face value, so both are corrected before anything is measured.

**1. Third-party overlay widgets are excluded.** **1200 of 8345 captured elements (14.4%) were dropped**; 7145 remain. Two widgets mount on every page and are never dismissed:

- **CookieYes** hides its banner on accept but leaves the preference-center modal mounted with real dimensions (~73 elements/page). Its own body text `#212121` ranked **4th** in the unfiltered palette on 885 occurrences and is not a FormFactor color at all. It is also themed in FormFactor's teal, which inflated the real `#00a0af` by ~52%.
- **WP Download Manager's side panel** contributes one hidden instance per page in stock Tailwind slate (`#0f172a`, `#1e293b`, `#64748b`) — three colors that otherwise entered the palette as *core* tokens at a deceptive 15/15 page spread.

BB PowerPack (`pp-*`/`fl-*`) and Formidable (`frm-*`) are deliberately **not** filtered: those plugins build FormFactor's real pages and forms.

**2. Frequencies are page-weighted, not raw.** The two paginated index templates (`company-news-events-press-releases` 2126, `blog` 1903) are **56.4% of all elements**, so a raw histogram describes a press-release list item rather than FormFactor. Every ranking below uses:

- **spread** — how many of the 15 page templates a value appears on. Immune to page size.
- **norm** — each page contributes one vote (its observations sum to 1.0), so all norms across a category sum to 15.

Raw counts are still recorded in every token's `$extensions` so each decision stays auditable.

**3. Names are FormFactor's where FormFactor has one.** The theme publishes its own `:root` tokens, so clusters that match an authored var are named after it (`primary`, not `blue-800`) and live under `color.theme.*`. The oklch-derived name is retained as `generatedName`. Clusters with no authored match land in `color.palette.*`.

## Authored theme colors — load-bearing vs declared-only

The theme declares **13** color vars in `:root`. Being declared is not the same as being used, and the split is the useful part:


| Authored var | Hex | Observed? | Token | Count | Spread | Roles (txt/bg/bdr) |
|---|---|---|---|---:|---:|---|
| `--primary` | `#003a63` | ✅ yes | `color.theme.primary` | 1855 | 15/15 | 1764/91/0 |
| `--dark` | `#003154` | ✅ yes | `color.theme.dark` | 30 | 15/15 | 0/30/0 |
| `--secondary` | `#00a0af` | ✅ yes | `color.theme.secondary` | 115 | 15/15 | 115/0/0 |
| `--secondary-light` | `#22b5d4` | ⚪️ declared only | — | 0 | 0/15 | — |
| `--tertiary` | `#4d7592` | ⚪️ declared only | — | 0 | 0/15 | — |
| `--tertiary-dark` | `#336182` | ⚪️ declared only | — | 0 | 0/15 | — |
| `--light` | `#ffffff` | ✅ yes | `color.theme.light` | 1002 | 15/15 | 905/57/40 |
| `--grey` | `#e1e1e1` | ✅ yes | `color.theme.grey` | 6 | 2/15 | 0/0/6 |
| `--dark-grey` | `#6f6a67` | ✅ yes | `color.theme.dark-grey` | 4113 | 15/15 | 4055/9/49 |
| `--grey-secondary` | `#9c968d` | ✅ yes | `color.theme.grey-secondary` | 197 | 15/15 | 69/0/128 |
| `--orange` | `#f26728` | ⚪️ declared only | — | 0 | 0/15 | — |
| `--purple` | `#7c2855` | ⚪️ declared only | — | 0 | 0/15 | — |
| `--yellow` | `#d2d755` | ✅ yes | `color.theme.yellow` | 15 | 15/15 | 15/0/0 |

**5 declared-only:** `--secondary-light`, `--tertiary`, `--tertiary-dark`, `--orange`, `--purple`. Present in the stylesheet but never resolved onto a rendered element in these 15 templates. Treat as available-but-unproven, not as part of the working palette.

## Palette

16 tokens clustered from 18 distinct observed colors (CIEDE2000 ΔE ≤ 2, seed min-count 2) — **10 core** (≥3 page templates) + **6 extended** (confined to 1–2 templates). Ordered by page-weighted norm.

### Core UI palette

| Token | Source | Hex | Norm | Count | Roles (txt/bg/bdr) | Merged | Pages |
|---|---|---|---:|---:|---|---:|---:|
| `dark-grey` | `--dark-grey` | `#6f6a67` | 6.600 | 4113 | 4055/9/49 | 1 | 15 |
| `light` | `--light` | `#ffffff` | 3.573 | 1002 | 905/57/40 | 1 | 15 |
| `primary` ⭐ | `--primary` | `#003a63` | 3.460 | 1855 | 1764/91/0 | 1 | 15 |
| `grey-secondary` | `--grey-secondary` | `#9c968d` | 0.649 | 197 | 69/0/128 | 1 | 15 |
| `secondary` ⭐ | `--secondary` | `#00a0af` | 0.314 | 115 | 115/0/0 | 1 | 15 |
| `dark` ⭐ | `--dark` | `#003154` | 0.116 | 30 | 0/30/0 | 1 | 15 |
| `yellow` | `--yellow` | `#d2d755` | 0.058 | 15 | 15/0/0 | 1 | 15 |
| `blue-600` | _blue-600_ | `#1e75b4` | 0.010 | 3 | 0/3/0 | 1 | 3 |
| `blue-400` | _blue-400_ | `#2bacdb` | 0.010 | 3 | 0/3/0 | 1 | 3 |
| `indigo-800` | _indigo-800_ | `#2d3a8b` | 0.010 | 3 | 0/3/0 | 1 | 3 |

### Extended (accent / one-off)

| Token | Source | Hex | Norm | Count | Roles (txt/bg/bdr) | Merged | Pages |
|---|---|---|---:|---:|---|---:|---:|
| `neutral-700` | _neutral-700_ | `#555555` | 0.051 | 17 | 17/0/0 | 1 | 1 |
| `neutral-800` | _neutral-800_ | `#444444` | 0.042 | 14 | 5/0/9 | 1 | 1 |
| `neutral-300` | _neutral-300_ | `#cccccc` | 0.042 | 13 | 1/0/12 | 1 | 2 |
| `orange-600` | _orange-600_ | `#b94a48` | 0.039 | 13 | 13/0/0 | 1 | 1 |
| `grey` | `--grey` | `#e1e1e1` | 0.016 | 6 | 0/0/6 | 2 | 2 |
| `neutral-800-2` | _neutral-800-2_ | `#333333` | 0.007 | 2 | 2/0/0 | 1 | 1 |

### Frequency, page-weighted (dominant → drift)

```
#6f6a67   6.600 ████████████████████████ dark-grey
#ffffff   3.573 █████████████··········· light
#003a63   3.460 █████████████··········· primary
#9c968d   0.649 ██······················ grey-secondary
#00a0af   0.314 █······················· secondary
#003154   0.116 ························ dark
#d2d755   0.058 ························ yellow
#555555   0.051 ························ neutral-700
#444444   0.042 ························ neutral-800
#cccccc   0.042 ························ neutral-300
#b94a48   0.039 ························ orange-600
#e1e1e1   0.016 ························ grey
#1e75b4   0.010 ························ blue-600
#2bacdb   0.010 ························ blue-400
#2d3a8b   0.010 ························ indigo-800
#333333   0.007 ························ neutral-800-2
```

**Dominant vs drift:** the 10 core tokens are the real palette; the 6 extended tokens are accents confined to one or two templates. 1 near-duplicate shades were merged into their nearest token, and 1 rare one-off colors (count < 2) were dropped as drift.

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
| 14 | 1.862 | 458 | 15/15 | `███·············` | — |
| 16 | 8.888 | 3156 | 15/15 | `████████████████` | `--size-400` (16px) |
| 18 | 3.462 | 3116 | 15/15 | `██████··········` | — |
| 19 | 0.214 | 91 | 3/15 | `················` | — |
| 20 | 0.030 | 9 | 3/15 | `················` | `--size-500` (21.28px) |
| 21 | 0.008 | 2 | 1/15 | `················` | `--size-500` (21.28px) |
| 25 | 0.098 | 25 | 5/15 | `················` | — |
| 26 | 0.035 | 8 | 7/15 | `················` | — |
| 28 | 0.012 | 3 | 1/15 | `················` | `--size-600` (28.32px) |
| 30 | 0.199 | 224 | 9/15 | `················` | — |
| 38 | 0.004 | 1 | 1/15 | `················` | `--size-700` (37.76px) |
| 45 | 0.130 | 38 | 6/15 | `················` | — |
| 67 | 0.057 | 14 | 13/15 | `················` | `--size-900` (67.2px) |

Font weights:

| Weight | Norm | Count | Spread |
|---:|---:|---:|---:|
| 400 | 11.968 | 6395 | 15/15 |
| 900 | 1.234 | 300 | 15/15 |
| 700 | 0.971 | 246 | 15/15 |
| 600 | 0.802 | 195 | 15/15 |
| 800 | 0.025 | 9 | 1/15 |

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

Inferred base grid: **2px** (73% of page-weighted spacing values are multiples).

**26 dominant values** (norm ≥ 0.5% of the page-weighted total):

| px | Norm | Count | Spread | Nearest authored step |
|---:|---:|---:|---:|---|
| 4 | 0.704 | 151 | 15/15 | `--size-200` (8.96px, Δ5.0) |
| 5 | 0.235 | 67 | 15/15 | `--size-200` (8.96px, Δ4.0) |
| 6 | 0.238 | 55 | 5/15 | `--size-200` (8.96px, Δ3.0) |
| 8 | 0.622 | 143 | 15/15 | `--size-200` (8.96px, Δ1.0) |
| 10 | 0.703 | 191 | 15/15 | `--size-200` (8.96px, Δ1.0) |
| 12 | 1.835 | 357 | 15/15 | `--size-300` (12px, Δ0.0) |
| 13 | 0.080 | 12 | 2/15 | `--size-300` (12px, Δ1.0) |
| 15 | 0.186 | 60 | 4/15 | `--size-400` (16px, Δ1.0) |
| 16 | 1.884 | 394 | 15/15 | `--size-400` (16px, Δ0.0) |
| 18 | 0.199 | 52 | 3/15 | `--size-400` (16px, Δ2.0) |
| 19 | 0.094 | 34 | 5/15 | `--size-500` (21.28px, Δ2.3) |
| 20 | 1.227 | 299 | 15/15 | `--size-500` (21.28px, Δ1.3) |
| 21 | 2.678 | 1135 | 15/15 | `--size-500` (21.28px, Δ0.3) |
| 24 | 0.317 | 62 | 15/15 | `--size-500` (21.28px, Δ2.7) |
| 26 | 0.090 | 32 | 3/15 | `--size-600` (28.32px, Δ2.3) |
| 28 | 0.354 | 92 | 9/15 | `--size-600` (28.32px, Δ0.3) |
| 30 | 0.653 | 133 | 15/15 | `--size-600` (28.32px, Δ1.7) |
| 32 | 0.115 | 32 | 4/15 | `--size-600` (28.32px, Δ3.7) |
| 38 | 0.169 | 36 | 15/15 | `--size-700` (37.76px, Δ0.2) |
| 40 | 0.331 | 164 | 15/15 | `--size-700` (37.76px, Δ2.2) |
| 50 | 0.505 | 140 | 15/15 | `--size-800` (50.4px, Δ0.4) |
| 54 | 0.313 | 62 | 15/15 | `--size-800` (50.4px, Δ3.6) |
| 60 | 0.474 | 110 | 14/15 | `--size-900` (67.2px, Δ7.2) |
| 81 | 0.173 | 45 | 12/15 | `--size-major` (89.6px, Δ8.6) |
| 92 | 0.107 | 21 | 15/15 | `--size-major` (89.6px, Δ2.4) |
| 99 | 0.360 | 85 | 15/15 | `--size-major` (89.6px, Δ9.4) |

Long tail (25 rare / off-scale values, flagged not tokenized): 1, 2, 3, 9, 11, 25, 29, 31, 34, 44, 49, 51, 55, 58, 59, 67, 83, 88, 90, 110, 120, 237, 330, 365, 552

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

## Shadows

**2 elevation token(s).** FormFactor barely uses shadow — there is no graduated elevation scale, just one common lift and a lighter variant.

- (102×) `rgba(0, 0, 0, 0.2) 0px 4px 15px 0px`
- (15×) `rgba(0, 0, 0, 0.1) 0px 4px 20px 0px`

Held back as drift (single-instance, single-page, plugin-authored — naming these would invent an elevation scale the site does not have): `rgb(128, 128, 128) 0px 0px 5px 0px` (1×); `rgb(238, 238, 238) 0px 1px 1px 0px` (1×); `rgba(18, 18, 23, 0.05) 0px 1px 2px 0px` (1×)
