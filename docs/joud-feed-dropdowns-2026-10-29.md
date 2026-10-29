# Feed settings dropdown styling — 2026-10-29

Replaced the language and interval native selects with a shared accessible popover/listbox. Language rows show inline vector UK, French and Lebanese flags; both menus use a rounded surface, soft lavender selected row, localized labels and the shared light/dark palette. Selected values still update the existing feed draft and are persisted by the existing save action. The interval remains numeric, and daily-only delivery time follows the selected interval.

Menus use the browser top layer to avoid dialog clipping, position above or below according to available space, remain viewport-bounded, and dismiss on outside click, Escape or focus leaving the menu. Arrow keys, Home/End and Enter support selection; focus returns to the trigger after selection/Escape. Arabic follows RTL order without translating user-entered content.

Validation: frontend typecheck/build passed. Existing frontend suite passed before the interval conversion; the final affected FeedEditor suite passed all ten tests after adapting to listbox selection. Twelve browser cases (both menus, English/French/Arabic, mobile/desktop) passed viewport bounds, selection, keyboard and focus checks. No live feed changes, accounts, emails or paid provider calls were used.
