# Dark appearance review

Reviewed staging Explore, the AI News reader and login at 1280px and 390px,
then checked Home, feed creation and reader states locally. Public source data
was replayed read-only; no inference or live feed mutations were needed.

The old palette combined a pure-black canvas and near-white headings with
low-contrast purple action text and purple card outlines. Body text already
had sufficient contrast; the changes address visual balance as well as
readability, rather than assuming all dark text failed accessibility checks.

Changes are limited to theme CSS:

- Charcoal canvas and neutral raised surfaces replace the black/white extremes.
- Softer heading text and a separate reading colour preserve clear hierarchy.
- Brighter accent text is separate from the darker solid-button fill, so white
  button labels remain readable.
- Card borders are neutral and purple card shadows are removed in dark mode.
- Placeholder text, form boundaries and profile labels adapt to dark surfaces.
- Existing light-mode colours, layout, controls and application behavior remain.

Selected static foreground/background contrast ratios:

| Pair | Before | After |
| --- | ---: | ---: |
| Accent action text / canvas | 4.15:1 | 8.28:1 |
| Reader body / card | 8.87:1 | 10.02:1 |
| Heading / canvas | 19.29:1 | 14.33:1 |
| Secondary text / card | — | 7.91:1 |
| White text / primary fill | — | 5.24:1 |

These are selected pairs, not a claim of complete WCAG conformance or a
clinical measure of eye comfort. Browser tests also calculate contrast from
computed styles, including composited backgrounds and citation badges.

Validation: 62 web unit tests, web and E2E TypeScript checks, production web
build, and 62 reader/layout/contrast browser checks passed. Four focused dark
checks passed again after adding placeholder and field-boundary styling.
Dark checks include read items, increased contrast and reduced motion.
Existing browser layout tests also exercise light mode and enlarged text.

Screenshots, public replay evidence and local logs are in
`.local-reports/dark-mode/` (uncommitted). Staging was inspected but this change
has not been deployed.
