# Apple-inspired web interface

Distilled.news presents a quiet public reading library. Feed sketches are its signature;
navigation and controls use familiar system typography and simple shapes. This is a
React web interpretation, not native Apple UI or a claim of full HIG compliance.

The implementation follows [Emil Kowalski's Apple design skill](https://github.com/emilkowalski/skills/blob/main/skills/apple-design/SKILL.md)
and [dickwu's Apple design skill](https://github.com/dickwu/apple-design-skill/blob/main/SKILL.md).
The relevant HIG references were accessibility, layout, typography, color, designing
for iOS, buttons, search fields, motion, and Liquid Glass, plus cross-platform translation.

## Visual system

[apple.css](../apps/web/src/apple.css) is imported after the legacy styles. It owns the
shared appearance across landing, Home, Explore, Settings, feed pages, and dialogs.

| Role | Light | Dark |
| --- | --- | --- |
| Page | `#FFFFFF` | `#000000` |
| Content surface | `#FFFFFF` | `#161618` |
| Quiet surface | `#F5F5F7` | `#202023` |
| Primary text | `#1D1D1F` | `#F5F5F7` |
| Secondary text | `#606064` | `#B5B5BD` |
| Limited accent | `#76C0EC` | `#76C0EC` |

Primary/secondary text contrast is 16.83:1 / 6.26:1 on the light page,
and 16.60:1 / 8.87:1 on the dark content surface. The accent is used for status
and star fill, with dark outlines and state labels rather than light-blue body text.

System fonts provide display, body, and control typography. Headlines use weight 650,
tighter tracking, and 1.12 leading; body and supporting text keep normal tracking
and 1.5 leading. Arabic keeps right alignment, normal tracking, and natural wrapping.

At regular widths, a sidebar accompanies a content pane with a consistent 76px header.
At compact widths, navigation becomes a bottom bar and cards use two columns.
Cards and forms stay opaque; translucent material belongs to navigation and the modal
backdrop. Settings use grouped rows, preferences use segmented controls, and search
keeps one surface with an explicit clear action.

## Interaction and constraints

Buttons respond immediately on press. Dialogs have a short opacity entrance that
does not block interaction. Reduced motion removes movement and dialog animation;
reduced transparency removes blur; increased contrast strengthens text and boundaries.
Keyboard focus, Escape dismissal, and focus restoration remain available.

The shared fit-to-screen scale keeps short pages compact, with a minimum page scale
of 85%. Longer lists scroll naturally instead of shrinking every page further.
Sticky headers and fixed navigation keep controls available; bottom spacing lets the
last card clear the navigation completely. Dialogs stop shrinking at 70% and scroll
when necessary. Partial cards during scrolling are natural, but no content is trapped
behind clipped containers.
Declared control and type sizes are measured before that scale; on dense screens,
physical sizes can therefore be smaller than Apple's accessibility defaults. Do not
describe this behavior as Dynamic Type compliance. Artwork has bounded heights so
its aspect ratio cannot defeat fitting when CSS zoom changes the available width.

Browser checks cover desktop and mobile, shared scaling, translation, feed controls,
source selection, keyboard search, reduced motion/transparency, and compact dialogs.
