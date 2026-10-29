# Reset password design and interface language review — 2026-10-29

The reset page follows Joud's supplied design: public header with the full transparent mark, centered heading and recovery subtitle, pale violet password input, visibility toggle and violet Save action. Its layout is independent of the authenticated dashboard/sidebar. Submission keeps the existing reset endpoint and token semantics, adds a pending guard, clears stale feedback and reports success/errors accessibly. No real passwords, accounts or email deliveries were changed during testing.

Localized static labels and accessible control names in authentication, email verification, initial setup, account management and feed controls. Added missing French/Arabic dictionary entries and replaced damaged source-diagnostic translations. Language updates document language/direction and mounted controls immediately. Case-insensitive lookup handles existing capitalization variants. Named template values are interpolated after translation, so names remain verbatim. No DOM-wide translation or translation of input values, feed names, source/article text or already-generated briefings is performed. Existing feed output language remains its own configuration; selecting the interface language does not regenerate published news. Unknown server error strings retain their original text rather than inventing an error meaning.

Validation:
- Frontend typecheck and production build passed; 100 frontend tests passed.
- Browser reset flows passed in English, French and Arabic at 320, 390, 1280 and 1672 pixel widths, including password visibility, retained typed value during switching, correct mocked reset payload and localized success. No overflow.
- Home and Explore retained a user title literally named `Home` across French/Arabic/English changes on mobile and desktop. Titles were not translated even though they match a UI dictionary key.
- Existing Home/Explore/reader layout checks passed at four screen sizes, retaining page scrolling and normal widget gaps.
- Static JSX and literal translation-call audit found no missing display keys in the checked source components; technical failure-code constants in conditional expressions are not display keys. This is not proof that every arbitrary backend error or future UI state has a translation.

## Normal sizing and shared landing header correction

Removed the custom header mark and all reset-specific header sizing overrides. The reset page now uses AppHeader and the same guest landing wrapper classes as the landing page. The form is bounded at 640px with 16px labels, a 48px field and a 32px desktop / 26px mobile heading. Recovery content uses the regular page scroll viewport with vertical scrolling enabled.

Browser validation compared reset and landing header/brand bounds at four widths in English, French and Arabic: matched within one pixel in all twelve cases. Wheel scrolling worked after reducing each viewport to 260px high. All twelve mocked reset submissions, visibility toggles and language-preserved input checks passed. Frontend typecheck and production build passed. No real account changes or emails were made.

## Schedule options and request-language authentication emails

Added missing translations for every update interval and the daily delivery-time label. Signup and password-reset requests now carry the current interface language explicitly. The backend validates en/fr/ar and defaults legacy requests to English; token lifetime, consumption, rate limits, account enumeration protection and mail transport are unchanged. Verification/reset emails localize subject, body, action, expiry and footer; Arabic HTML is RTL, while raw links remain LTR. Each link carries a validated language so the destination renders in that language on another browser/device. User data and names are unchanged.

Validation: 104 frontend tests and 67 Worker app/mailer tests passed, including every interval, per-request language delivery, Arabic signup followed by French reset, and both email types in all three languages. Frontend/Worker typechecks and build passed. Twelve local browser reset/link flows passed across three languages and four widths, starting with English stored preference and following language-specific links. No real emails were sent and no real accounts were modified. Existing delivered emails retain their original content.
