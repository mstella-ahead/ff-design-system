# FormFactor components

Derived from the computed styles and screenshots of 15 page templates on www.formfactor.com.

Each component is detected from the `formfactor-2022` theme's own BEM-ish class names plus computed styles and geometry. Colors cross-link to `../tokens/color.json`, where tokens carry FormFactor's authored names (`primary`, `secondary`) rather than generated ones.

| Component | Instances | Variants | Pages |
|---|---:|---:|---:|
| [Hero](hero.mdx) | 13 | 2 | 13 |
| [Footer](footer.mdx) | 15 | 1 | 15 |
| [CTA band](cta-band.mdx) | 5 | 1 | 4 |
| [Breadcrumb](breadcrumb.mdx) | 11 | 1 | 11 |
| [Card](card.mdx) | 113 | 8 | 13 |
| [Tabs](tabs.mdx) | 102 | 2 | 3 |
| [Form field](form-field.mdx) | 72 | 4 | 15 |
| [Table](table.mdx) | 1 | 1 | 1 |
| [Button](button.mdx) | 99 | 6 | 15 |
| [Nav item](nav-item.mdx) | 90 | 2 | 15 |
| [Heading](heading.mdx) | 124 | 4 | 15 |
| [Link](link.mdx) | 1593 | 4 | 15 |

## Honest gaps

- **No pull quote.** There are zero `<blockquote>` elements across all 15 templates, including the long-form blog post. If a prototype needs one, it is being invented, not reproduced.
- **No spec table worth the name.** Exactly one `<table>` exists in the whole crawl (5 `<th>`, 20 `<td>`, on one industry page). The product detail page has no spec table at all, so there is no house table style to copy. `table.mdx` documents the single instance and should be treated as unproven.
- **Mega-menu dropdowns are captured but not exercised.** The `nav#mega-menu` panel is 740×395 and its contents are in the DOM, but the crawl never hovers it open, so the dropdown variant's rendered state is inferred from computed styles rather than seen.
- **Hover/focus states live in `raw/<page>/states.json`**, captured via CDP `forcePseudoState`, and are not yet folded into these files.

