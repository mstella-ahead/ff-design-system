# FormFactor Design System

A reverse-engineered design system extracted from [www.formfactor.com](https://www.formfactor.com), packaged so an agent (or a person) can build on-brand FormFactor pages and prototypes.

Everything here is derived from the **rendered** site — `getComputedStyle` on 15 page templates at four viewport widths — and reconciled against the `formfactor-2022` WordPress theme's own authored `:root` variables. Where FormFactor named a token, that name is used.

---

## Start here

**Building a page?** Read [`docs/design-system.md` §11](docs/design-system.md#11-constitution--ten-rules-a-prototype-must-not-break) — ten rules, one screen. Then [`docs/patterns.md`](docs/patterns.md) for the compositions.

**Just want the three that matter most?**

1. **Headings are teal `#00A0AF`. Body copy is warm grey `#6F6A67`.** Not navy headings, not black text. This one pairing does more than anything else to make a page read as FormFactor.
2. **Everything rounds at 30px — cards *and* buttons.** A 40px-tall button becomes a full pill; that's the intended read. Form fields at 20px are the only exception. Nothing is sharp.
3. **Weight 400 everywhere.** Hierarchy comes from size, never bold. A 67px hero heading at weight 400 is correct.

## Quick start

```html
<link rel="stylesheet" href="tokens/tokens.css">     <!-- generated tokens -->
<link rel="stylesheet" href="tokens/utilities.css">  <!-- composition layer -->

<div class="ff-hero">
  <div class="ff-wrapper">
    <div class="ff-hero__body ff-flow">
      <h1 class="ff-h1">Contact Intelligence <span>from lab to fab</span></h1>
      <p>Measurement you can act on at every stage of the IC life cycle.</p>
      <a class="ff-btn" href="/products/">Explore products</a>
    </div>
    <hr class="ff-hero__rule">
  </div>
</div>
```

That renders the signature hero: teal heading with a navy second clause, warm-grey summary, navy pill CTA, and the 4px orange rule that closes every FormFactor hero.

Open [`examples/landing.html`](examples/landing.html) in a browser for a full page — hero, card grid, dark band, CTA panel, form, footer — built from nothing but these two stylesheets.

## What's here

| Path | What's in it |
|---|---|
| [`docs/design-system.md`](docs/design-system.md) | The spec. Tokens with evidence counts, heading roles, the **ten-rule constitution**, and an honest-gaps section. |
| [`docs/patterns.md`](docs/patterns.md) | Composition patterns — hero, card grid, CTA panel, dark band, `.flow` rhythm, form, header, footer. |
| `tokens/tokens.css` | **Generated.** All tokens as `--ff-*` custom properties, including the responsive overrides. Never hand-edit. |
| `tokens/utilities.css` | **Hand-written.** The composition layer (`.ff-flow`, `.ff-radius`, `.ff-btn`, `.ff-card`…). `analyze.ts` never touches it. |
| `tokens/*.json` | W3C Design Tokens — color, typography, spacing, radius, shadow, breakpoints. Each token carries provenance under `$extensions["com.formfactor.www"]`: observed count, page spread, role split, oklch, merged raw colors, and source pages. |
| `tokens/REPORT.md` | The audit trail. Palette histogram, load-bearing vs declared-only vars, responsive tables, and what was filtered out and why. |
| `components/*.mdx` | 12 components — purpose, when-to-use, variant table, canonical markup, rules-and-gotchas, screenshot region. |
| `CLAUDE.md` | Architecture, every verified finding, and the phased build log. Start here to change the pipeline. |

## Regenerating

```bash
npm install
npx playwright install chromium

npm run crawl           # 1440x900 -> raw/          (touches network)
npm run crawl:mobile    #  390x844 -> raw-mobile/
npm run crawl:tablet    #  768x1024 -> raw-tablet/
npm run crawl:laptop    # 1280x800 -> raw-laptop/

npm run analyze         # raw*/ -> tokens/ + components/   (no network, re-run freely)
npm run validate:tokens
```

Crawling is slow and analysis is fast, which is why they're separate scripts — you re-run `analyze` constantly while tuning and `crawl` rarely. It also means drift detection is nearly free: re-crawl on a schedule, re-analyze, diff `tokens/`.

Four viewports because the theme names four bands (`base` / `-t` 480 / `-sd` 1024 / `-hd` 1435). The two middle crawls aren't optional decoration — they're what revealed that the type scale has only *three* effective steps, and that the container width regresses at `-sd`.

## Provenance & honesty

- **Ground truth is computed style, not source CSS.** A WordPress page is the sum of a theme, a page builder, a forms plugin, WooCommerce and Font Awesome; the source is not the intent. The clearest example: the theme declares `--wrapper-max-width: 65rem` (1040px) but the value that actually resolves at desktop is ~1433px.
- **Third-party noise is filtered, and it's substantial.** 14.7% of captured elements are CookieYes and WP Download Manager chrome. Left in, CookieYes's own `#212121` ranks 4th in the palette on 885 occurrences — a color FormFactor never uses. 131 of 175 `:root` vars belong to plugins, including a `--color-primary: #4a8eff` that is *not* FormFactor's navy.
- **Frequencies are page-weighted.** Two paginated index templates are half the captured elements, so raw counts describe a press-release list item rather than the site.
- **Two findings were invisible until a screenshot was examined by eye** — colors painted by `::before`/`::after`, and border colors on non-top edges. Both are fixed in the crawler now, but the lesson generalises: treat any purely computed-style extraction as incomplete until checked against an image. Including this one.
- **What this does not recover** — motion, hover/focus states (captured in `raw/*/states.json` but not yet folded in), open mega-menu state, iconography rules, and every editorial judgment. The full list is [§12 of the spec](docs/design-system.md#12-honest-gaps).

`raw/` and its siblings are git-ignored. This repo ships the distilled system and the scripts, never the scrape.

## License & scope

A reverse-engineered reference for prototyping and internal design work. **The design language belongs to FormFactor, Inc.** Don't use this for anything that competes with, impersonates, or misrepresents FormFactor.

No FormFactor logos or photography are redistributed here — every example uses `placehold.co`. Proxima Nova is FormFactor's licensed typeface and is not included; `tokens.css` names it first and falls back to a system sans.
