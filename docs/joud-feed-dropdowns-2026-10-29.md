# Feed settings dropdown styling — 2026-10-29

Replaced the language and interval native selects with a shared accessible popover/listbox. Language rows show inline vector UK, French and Lebanese flags; both menus use a rounded surface, soft lavender selected row, localized labels and the shared light/dark palette. Selected values still update the existing feed draft and are persisted by the existing save action. The interval remains numeric, and daily-only delivery time follows the selected interval.

Menus use the browser top layer to avoid dialog clipping, position above or below according to available space, remain viewport-bounded, and dismiss on outside click, Escape or focus leaving the menu. Arrow keys, Home/End and Enter support selection; focus returns to the trigger after selection/Escape. Arabic follows RTL order without translating user-entered content.

Validation: frontend typecheck/build passed. Existing frontend suite passed before the interval conversion; the final affected FeedEditor suite passed all ten tests after adapting to listbox selection. Twelve browser cases (both menus, English/French/Arabic, mobile/desktop) passed viewport bounds, selection, keyboard and focus checks. No live feed changes, accounts, emails or paid provider calls were used.

## Matched field styling and menu edges

Updated both triggers to pale lavender fills/borders and violet chevrons. The closed language trigger uses the reference globe badge; flag icons remain inside its options. Popover width now comes from the trigger's measured width, and its left edge aligns with the trigger. Menus open directly above or below with a 6px gap according to available viewport space, and constrain height rather than extending off-screen. All twelve desktop/mobile language and interval browser cases passed exact edge alignment (within one pixel), adjacent placement, selection, keyboard, focus and viewport checks. Build and frontend typecheck passed.
