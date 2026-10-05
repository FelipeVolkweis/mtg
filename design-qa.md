# Match UI design QA

Implemented the approved second direction, including the subsequent request to eliminate battlefield and Hand scrolling. Desktop and tablet landscape checks pass; narrow portrait readability remains limited.

## Evidence

- Approved source: `/home/volkweis/.codex/generated_images/01a10ce9-dd34-7861-894c-f837490e99dd/exec-af090da8-b653-4045-b97b-3067ac576d06.png`.
- Final browser render: `/home/volkweis/.codex/visualizations/2026/10/05/01a10ce9-dd34-7861-894c-f837490e99dd/match-ui/implementation-final.png`.
- Combined comparison: `/home/volkweis/.codex/visualizations/2026/10/05/01a10ce9-dd34-7861-894c-f837490e99dd/match-ui/comparison-final.png`.
- Focused Stack/Priority/phase comparison: `/home/volkweis/.codex/visualizations/2026/10/05/01a10ce9-dd34-7861-894c-f837490e99dd/match-ui/controls-comparison.png`.
- Local preview: `http://127.0.0.1:3011/room/b074423eb486f4f189aec4a15e3104304e3cf2974a0a0536`.

The 1759×894 source was normalized to 1732×880 for comparison. The implementation uses actual catalog printings and engine state: supported Hand cards, Library counts, and effective creature stats differ from the illustrative mockup. No engine data was changed to imitate inaccurate mockup text.

## Comparison

| Surface | Result |
| --- | --- |
| Layout and spacing | Flat orthographic board; amber opponent and teal local side; charcoal Hand dock; no app/match headers, empty type zones, divisions, or visible group labels. Dynamic sizing preserves whitespace and keeps occupied groups separate. Local Lands use the rear row. Existing type precedence and attachment ownership remain intact. |
| Typography | Serif life totals and phase heading provide hierarchy; compact sans-serif controls and state text. Phase progression explicitly resets inherited list padding, preventing clipping at smaller desktop widths. |
| Palette and surfaces | Amber/teal ownership colors and dark command surfaces retained. Decorative mockup texture/glow and circular phase markers are simplified. Priority remains the strongest actionable control. |
| Imagery | Real catalog card fronts retain their printed aspect ratio. Tapped cards rotate 90 degrees without perspective. Hidden cards use a custom generated, optimized WebP card back. No fake card fronts or CSS illustrations replace catalog artwork. |
| Copy and state | Stack entries show owner, kind, resolution order, next-to-resolve, and targets. Priority consequence copy supports consecutive passes and multiplayer rather than assuming exactly two players. Current phase and step sit below Pass Priority. |
| Icons | Native Room disclosure and text controls remain consistently accessible. Mockup decorative arrows and circular markers were omitted. |
| Interactions | Card-side menus expose legal casts, plays, and abilities; drag casting remains supported. Room and public Zone drawers open/close. Required payment/combat choices occupy the command rail, keeping sources selectable. Expanded piles spread in place without a drawer. Their original identities remain together across state changes; outside clicks or Escape collapse the spread. During combat assignments, selecting a target retains the source spread. |
| Accessibility | Semantic card/player buttons, named regions/dialogs, screen-reader Match heading and player life labels remain. Empty groups are absent. Visible ownership labels supplement color. Existing keyboard focus, Escape dismissal, and Alt preview are preserved. Full screen-reader and text-zoom audits were not performed. |

## Corrections verified

- Removed battlefield overflow and wrapping; ResizeObserver sizing accounts for tapped card width, occupied group gaps, and attachment space.
- Removed both horizontal and vertical Hand scrolling. All seven preview cards fit in one tray row with their full printing visible.
- Pile expansion fans cards out within the battlefield with adaptive sizing, without a separate drawer.
- Payment prompts no longer cover mana sources. Combat pile selection leaves attack targets accessible.
- Added local Library, Graveyard, and Exile; clearly separated Hand from battlefield.

Measured content size equals visible container size for both battlefield sides and the local Hand at 1732×880, 1280×720, and 1024×768. At the reference viewport, battlefield heights are 221/311 px and local Hand height is 136 px, with no overflow. Smaller widths use adaptive card sizing; the Stack may scroll internally when needed, as may temporary choice and Zone drawers.

## Remaining limitation

At 390×844 portrait width, the desktop-oriented command rail consumes much of the board and cards compress heavily. The viewport-height fallback removes the previous forced 850 px page height, but portrait gameplay readability and practical touch sizes need a separate mobile layout. No desktop fidelity or interaction blocker remains in the exercised scenarios. Arbitrarily large boards can also exceed useful card readability even though ordinary scenarios fit.

## Validation

- `npm run typecheck`: passed.
- Production build: passed (also run by Playwright before the final suite).
- `npx playwright test tests/integrity.spec.ts tests/interactive-ui.spec.ts tests/rules-ui.spec.ts`: **20 passed**.
- `git diff --check`: passed.
- Final comparison inspected as a combined image and focused control crop, after fixing initial clipping/scrolling and inherited phase-list styles.

The tests cover reconnects, payment, targeting, cast permissions, pile access, attachments, combat assignments, private resolution choices, solo practice, Room drawer visibility, group visibility, Hand separation, no-scroll geometry, and phase placement. An intermediate run lost assets during a concurrent rebuild; the complete final suite used a stable build and passed.

## Temporary spread follow-up

Replaced pile drawers with an in-place spread. Opened object identities stay together across tapping and other status changes, so the player can activate the next untapped source without reopening a different pile. Outside clicks and Escape restore normal grouping; combat assignments retain a spread while selecting targets. Existing changed-state copies outside the original spread remain distinct.

Verified two consecutive Island mana activations in the preview with all six original cards still spread. Evidence: `/tmp/mtg-islands-spread.png`. Typecheck and build passed; all 19 tests in `tests/interactive-ui.spec.ts` and `tests/rules-ui.spec.ts` passed, including consecutive activations, outside dismissal, Escape, a 104-card pile, and combat assignments. The Docker app was rebuilt with the same implementation and its public assets.

## Ability description follow-up

All 129 authored abilities across the 67 implemented definitions now have an exact matching Oracle Text excerpt as `description`. Structured gameplay data is unchanged. Activation buttons display the description, with a color-choice suffix for mana abilities that offer multiple colors. The schema accepts nonempty descriptions and preserves compatibility with older descriptions-free definitions; catalog imports preserve authored abilities and their descriptions.

Verified Sai's button displays `{1}{U}, Sacrifice two artifacts: Draw a card.` and wraps comfortably beside its card. Screenshot: `/tmp/sai-ability-description.png`. Typecheck and build passed; all 175 tests in the catalog, rules, interactive UI, and rules UI suites passed. Coverage checks every implemented ability's description and verifies Sai, Mind Stone, and distinct Arcane Signet color choices.
