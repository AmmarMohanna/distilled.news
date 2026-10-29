# Feed settings dropdown styling — 2026-10-29

Replaced the language and interval native selects with a shared accessible popover/listbox. Language rows show inline vector UK, French and Lebanese flags; both menus use a rounded surface, soft lavender selected row, localized labels and the shared light/dark palette. Selected values still update the existing feed draft and are persisted by the existing save action. The interval remains numeric, and daily-only delivery time follows the selected interval.

Menus use the browser top layer to avoid dialog clipping, position above or below according to available space, remain viewport-bounded, and dismiss on outside click, Escape or focus leaving the menu. Arrow keys, Home/End and Enter support selection; focus returns to the trigger after selection/Escape. Arabic follows RTL order without translating user-entered content.

Validation: frontend typecheck/build passed. Existing frontend suite passed before the interval conversion; the final affected FeedEditor suite passed all ten tests after adapting to listbox selection. Twelve browser cases (both menus, English/French/Arabic, mobile/desktop) passed viewport bounds, selection, keyboard and focus checks. No live feed changes, accounts, emails or paid provider calls were used.

## Matched field styling and menu edges

Updated both triggers to pale lavender fills/borders and violet chevrons. The closed language trigger uses the reference globe badge; flag icons remain inside its options. Popover width now comes from the trigger's measured width, and its left edge aligns with the trigger. Menus open directly above or below with a 6px gap according to available viewport space, and constrain height rather than extending off-screen. All twelve desktop/mobile language and interval browser cases passed exact edge alignment (within one pixel), adjacent placement, selection, keyboard, focus and viewport checks. Build and frontend typecheck passed.

## Preferences card and matching daily-time field

Wrapped the Preferences disclosure and its conditional Schedule/General contents in one continuous bordered card. The expanded contents no longer have a separate outer border. Daily delivery time uses the same measured control width, 44px total height, pale lavender fill, border and radius as the dropdown above it. Replaced the black native clock indicator with an accent-colored accessible picker button; input remains a native time field and keeps its existing value/save behavior.

Frontend typecheck, production build and all ten FeedEditor tests passed. Six browser cases (mobile/desktop, English/French/Arabic) verified the shared card, no inner panel border, matching time/dropdown dimensions and fill, and working language dropdown selection/keyboard behavior. No real feed was changed during checks.
