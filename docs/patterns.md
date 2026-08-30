# Composition Patterns

Page-level patterns observed across www.formfactor.com. These matter more than any individual component: get the composition right and a prototype reads as on-brand even before the details are perfect.

All examples use the `ff-` prefixed classes from `tokens/utilities.css`. The real theme class names are noted alongside so you can cross-reference `components/*.mdx` and the raw capture.

---

## A. Page hero — the one pattern every template uses

Every one of the 15 crawled templates opens with this. Teal `h1` at the largest step, warm-grey summary, pill CTA, and a 4px orange rule closing it.

```html
<div class="ff-hero">
  <div class="ff-wrapper">
    <div class="ff-hero__body ff-flow">
      <h1 class="ff-h1">Semiconductor Test</h1>
      <div class="ff-flow ff-flow-space-300">
        <p>We're paving the shortest path <strong>from lab to fab.</strong></p>
      </div>
      <a class="ff-btn ff-flow-space-500" href="/about">Learn more</a>
    </div>
    <hr class="ff-hero__rule">
  </div>
</div>
```

*Theme classes: `.page-header` › `.wrapper` › `.page-header__body` › `.page-header__inner.flow` › `h1.page-header__heading`. The rule is `.page-header__body::after`.*

**Homepage variant — the two-tone heading.** Same structure, but the sentence splits across two colors. This is the single most recognisable gesture in the system.

```html
<h1 class="ff-h1">Semiconductor Test <span>and Measurement</span></h1>
```

Teal leads, navy lands. Use it on a landing-page hero or a CTA panel — not on ordinary section headings.

## B. Card grid

The workhorse of every index page. Cards are `article` or `li`, always 30px radius, always shadowed.

```html
<section class="ff-section">
  <div class="ff-wrapper ff-flow">
    <h2 class="ff-h2">Explore our products</h2>
    <ul class="ff-card-grid">
      <li>
        <article class="ff-card ff-card--media">
          <img src="https://placehold.co/600x400" alt="">
          <div class="ff-card__body ff-flow ff-flow-space-400">
            <h3 class="ff-h3 ff-card-title">Apollo</h3>
            <p>High-parallelism probe card for foundry and logic test.</p>
            <a class="ff-btn" href="/product/apollo/">View product</a>
          </div>
        </article>
      </li>
      <!-- repeat -->
    </ul>
  </div>
</section>
```

*Theme classes: `ul.product-family-card__grid` › `li` › `article.product-family-card.radius.shadow`.*

`--media` makes the image full-bleed with the text padded separately. That's what the observed `border-radius: 30px 30px 0 0` on a card image implies — a top-rounded image only makes sense if it meets the card edge, which it can't do inside uniform card padding. Use plain `.ff-card` (padded all round) for text-only panels like the CTA band.

Note `ff-card-title` — the card's heading is navy, not teal, because it is (or sits inside) a link. A section heading above the grid stays teal. That contrast between the teal section label and the navy card titles is doing real work; don't flatten it.

## C. CTA panel

Closes a page, or sits between content sections. A rounded shadowed panel holding a centered heading and two or three equal-weight actions.

```html
<section class="ff-section">
  <div class="ff-wrapper">
    <div class="ff-card ff-flow ff-center">
      <h2 class="ff-h2">When market pressure demands the shortest possible path,
        <span>we deliver.</span></h2>
      <ul class="ff-card-grid">
        <li class="ff-flow ff-flow-space-600">
          <p>Talk to an applications engineer about your test challenge.</p>
          <a class="ff-btn" href="/contact">Contact sales</a>
        </li>
        <li class="ff-flow ff-flow-space-600">
          <p>Browse probe cards by device family and process node.</p>
          <a class="ff-btn" href="/products/">See products</a>
        </li>
      </ul>
    </div>
  </div>
</section>
```

*Theme classes: `section.cta-box` › `.wrapper` › `.cta-box__content.flow.radius.shadow` › `.cta-box__heading.flow.center` + `.cta-box__body` › `ul.cta-grid`.*

This is the second place two-tone appears on the homepage. Two or three items — never four.

## D. Dark band

Used to break up a long page. `--dark` `#003154` is a **background-only** color; it has zero text uses across the whole crawl.

```html
<section class="ff-section ff-on-dark">
  <div class="ff-wrapper ff-flow ff-center">
    <h2 class="ff-h2">Contact intelligence</h2>
    <p>Measurement you can act on, from wafer to system.</p>
    <a class="ff-btn ff-btn--light" href="/technologies/">Learn how</a>
  </div>
</section>
```

Headings go white on dark, not teal — `h2` is observed white 7 times, always on a dark band. Buttons flip to `--btn--light` (white fill, navy label).

## E. Vertical rhythm — compose with `.flow`, never with margins

This is the pattern most likely to be violated by habit, so it's worth stating on its own.

```html
<!-- Right: the parent owns the rhythm -->
<div class="ff-flow ff-flow-space-500">
  <h2 class="ff-h2">Heading</h2>
  <p>First paragraph.</p>
  <p>Second paragraph.</p>
  <a class="ff-btn" href="#">Action</a>
</div>

<!-- Wrong: per-element margins -->
<h2 style="margin-bottom: 24px">Heading</h2>
```

`.ff-flow > * + *` applies `margin-top: var(--ff-flow-space)`. Change the step by adding a modifier to the *container*, not to the children. Nest freely — an inner `.ff-flow` with its own modifier tightens a subgroup, which is exactly how the real hero handles its summary block.

## F. Form

The one place geometry deviates: fields are 20px, not 30px. Submit buttons stay full pills.

```html
<form class="ff-flow ff-flow-space-500">
  <div class="ff-field">
    <label for="email">Work email</label>
    <input type="email" id="email" name="email">
  </div>
  <div class="ff-field">
    <label for="app">Application</label>
    <select id="app" name="app">
      <option>Foundry &amp; logic</option>
      <option>DRAM</option>
    </select>
  </div>
  <button class="ff-btn" type="submit">Submit</button>
</form>
```

*Theme classes: `.frm_form_field.form-field.frm_top_container` › `label.frm_primary_label` + `input`. Markup comes from Formidable Forms — those `frm_*` classes are real content, not vendor chrome.*

## G. Header + persistent edge tab

The header is fixed at 92px with the logo left and uppercase nav right. Alongside it, a distinctive persistent element: a rotated pill fused to the right viewport edge, on every page.

```html
<header class="ff-header">
  <div class="ff-wrapper ff-header__inner">
    <a href="/"><img src="https://placehold.co/340x60" alt="FormFactor" width="340"></a>
    <nav class="ff-nav">
      <a href="/products/" aria-current="page">Products</a>
      <a href="/applications/">Applications</a>
      <a href="/industries/">Industries</a>
      <a href="/sales-service/">Sales &amp; Service</a>
      <a href="/company/">Company</a>
    </nav>
  </div>
</header>

<a class="ff-btn ff-edge-tab" href="/contact">Contact us</a>
```

*Theme classes: `header#site-header` › `.wrapper` › `.site-header__inner` › `a.site-header__logo` + `nav#mega-menu` › `.top-level` › `a.menu-item`. Edge tab: `.contact-us-button__anchor.btn.btn-primary.shadow`.*

Nav links are 12px, weight 600, uppercase, letterspaced, navy — and their box is only **16px tall**. The active item takes a teal underline (`inset 0 -3px`). Below 480px this whole thing is replaced by a hamburger opening a white-on-dark drill-down, not reflowed.

## H. Footer

Four link columns with teal headings, closing on a yellow info line — the only place `--yellow` appears.

```html
<footer class="ff-footer">
  <div class="ff-wrapper">
    <div class="ff-footer__grid">
      <div>
        <h3>Products</h3>
        <ul>
          <li><a href="/products/probe-cards/">Probe cards</a></li>
          <li><a href="/products/probes/">Probes</a></li>
        </ul>
      </div>
      <!-- three more columns -->
    </div>
    <div class="ff-footer__info"><p>&copy; FormFactor, Inc.</p></div>
  </div>
</footer>
```

*Theme classes: `footer.site-footer` › `section.site-footer__inner` › `.site-footer__body` › `.col.col-one`…`.col-four`, plus `.site-footer__info`.*

The footer's top corners are rounded (`0 0 30px 30px` observed on `div.footer`), so it reads as a panel the page sits on.

---

## Assembling a page

The templates all follow the same skeleton:

```
header (fixed)
hero            ← teal h1, summary, CTA, orange rule
[breadcrumb]    ← on anything nested below a section index
section         ← content: card grid, prose, or dark band
section
cta panel       ← two or three next steps
footer
edge tab (fixed)
```

Alternate light sections with the occasional dark band; don't stack two dark bands. Close with the CTA panel — it appears on 4 of 15 templates and always last.

See `examples/landing.html` for the whole thing assembled and rendering.
