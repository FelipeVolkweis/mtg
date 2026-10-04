# Manual Match Tabletop Redesign

Status: ready-for-agent

## Problem Statement

The current Manual Match screen makes the table difficult to use. Forms occupy the top of the page, the empty Battlefield dominates the initial view, and important Zones sit below the fold. Players must scroll to understand the Match, and cards do not feel like the focus of play. The attached EDHPlay and MTG Arena examples show the desired direction: a readable table centered on card images, player state, and immediate actions. The game already stores Card Printing artwork and supports synchronized card actions, but the screen does not present those capabilities clearly, especially for three or four Match Players.

## Solution

Replace the scrolling Match page with a viewport-fitted, card-first tabletop. Keep one shared Battlefield and shared Battlefield Layout, but render one colored Player Area per Match Player. Four players appear in a 2×2 table; the arrangement scales down for three, two, and Solo Matches. Each viewer sees their own area nearest the bottom, can zoom and pan locally, and keeps their own Hand visible. Public card images, an Alt-hover full-card preview, compact Zones, a central Stack, and nearby controls make the Match usable without leaving the table.

Keep play manual. Participants still decide when to draw, mulligan, move, tap, and resolve effects. The interface performs repetitive opening-hand card moves when asked, records a Mulligan Count, and keeps existing server-authoritative synchronization and hidden-Zone privacy. Decorative Battlefield art, automatic card organization, rules enforcement, and undo are outside this redesign.

## User Stories

1. As a Match Player, I want to see the table immediately after a Match starts, so that I can begin setup without navigating a separate screen.
2. As a Match Player in a four-player Match, I want four distinct Player Areas in a 2×2 table, so that I can understand each player's board at a glance.
3. As a Match Player in a three-player Match, I want two opponent areas above a wider local area, so that the available screen space is used for the players present.
4. As a Match Player in a two-player Match, I want my opponent above my area, so that the table reads like a face-to-face game.
5. As a Match Player in a Solo Match, I want my Player Area to use the table, so that goldfishing does not leave empty opponent spaces.
6. As a Match Player, I want my Player Area nearest the bottom, so that my perspective stays familiar in every Match size.
7. As a Match Player, I want each Player Area to have a distinct accent color and a visible player name, so that I can recognize players without relying on color alone.
8. As a Match Player, I want these accents to be independent of deck colors and Color Identity, so that interface color does not imply a Magic rule.
9. As a Match Player, I want my Hand visible along the bottom of the table, so that I can play cards without searching through the page.
10. As a Match Player, I want opponents' Hands shown by concealed card backs and counts, so that I can see their hand sizes without seeing private identities.
11. As a Match Player, I want an opponent's card backs in the same color family as that opponent's Player Area but visibly distinct from it, so that hidden cards remain easy to attribute.
12. As a Match Player, I want visible cards to show their Card Printing artwork, so that the table feels like a card game and cards are easy to recognize.
13. As a Match Player, I want a readable card fallback when artwork is unavailable or fails to load, so that a missing image does not hide a known card.
14. As a Match Player, I want to hold Alt while hovering over a visible card to see its full image, so that I can read it without changing my table zoom.
15. As a Match Player, I want the initial table to fit a laptop viewport without page scrolling, so that player state and the Battlefield remain in view together.
16. As a Match Player, I want to zoom the table with the wheel, so that I can inspect a crowded Player Area.
17. As a Match Player, I want to pan with Space-drag, so that I can move around a zoomed table without moving cards.
18. As a Match Player, I want a visible Fit table control, so that I can return to the complete overview.
19. As a Match Player, I want my zoom and pan to remain local to my view, so that my navigation does not disrupt other participants.
20. As a Match Player, I want to place cards freely on the Battlefield, so that unusual board states can be represented without forced rows or categories.
21. As a Match Player, I want dragging a card to commit its move on release, so that all participants receive one synchronized result.
22. As a Match Player, I want dragging a permanent into another Player Area to change only its placement, so that a visual move does not accidentally change Controller.
23. As a Match Player, I want an explicit Change controller action, so that a control change is deliberate.
24. As a Match Player, I want a permanent to appear in its new Controller's Player Area when control changes, so that the table reflects who controls it while preserving its Owner.
25. As a Match Player, I want to click a card to select it, so that its available actions and details are clear.
26. As a Match Player, I want to double-click a permanent to tap or untap it, so that a frequent action takes one quick gesture.
27. As a Match Player, I want T to tap or untap my selected permanent, so that I can use the keyboard during play.
28. As a Match Player, I want common card actions in a nearby menu and uncommon state changes in a detailed inspector, so that routine play does not depend on a large permanent form.
29. As a Match Player, I want the shared Stack near the center of the table, so that spells and abilities waiting to resolve are visible to everyone.
30. As a Match Player, I want compact Zone indicators near the relevant players, so that I can find Libraries, Graveyards, Exile, and the Command Zone without scrolling past the Battlefield.
31. As a Match Player, I want Zone contents to open in drawers that can scroll internally, so that a large Zone does not enlarge the Match page.
32. As a Match Player, I want Life Totals and Turn State controls near the players and cards they affect, so that routine updates are easy to locate.
33. As a Match Player, I want guided opening controls near my Hand, so that I know how to begin while the table remains visible.
34. As a Match Player, I want one action to draw my opening seven cards, so that I can begin play quickly without seven separate clicks.
35. As a Match Player, I want a Mulligan action to return my Hand to my Library, shuffle, draw seven, and increase my Mulligan Count, so that I can redraw without repeating those mechanical steps.
36. As a Match Player, I want my Mulligan Count to be visible and manually correctable, so that the table accurately records the number of mulligans I have taken.
37. As a Match Player, I want to handle any cards placed on the bottom of my Library myself, so that the app does not enforce or remind me about that rule.
38. As a Room Participant, I want to continue manipulating public Game Objects, so that Player Area colors do not impose new permissions in a Manual Match.
39. As a Match Player, I want my private Hand and Library identities hidden from opponents in every card view and preview, so that the new visual interface preserves Match privacy.
40. As an observer of a Solo Match, I want to see the table without gaining action permissions, so that observation remains safe.
41. As a reconnecting Match Player, I want the shared layout, Mulligan Count, and card state restored, so that a disconnect does not lose the Match.
42. As a Match Player, I want card state changes to appear for all participants in revision order, so that the table remains consistent during simultaneous play.

## Implementation Decisions

- Keep a single shared Battlefield Zone. Player Areas are presentation regions within its Battlefield Layout, not new Zones or rules concepts. Preserve the distinction among Owner, Controller, and visual placement.
- Persist a canonical shared card arrangement that is independent of viewport pixels and each viewer's camera. Render it from the viewer's seat perspective. Local zoom, pan, and Fit table state do not enter shared Match state.
- A drag across Player Areas changes only placement. An explicit Controller change moves the permanent to the new Controller's area without changing its Owner. Keep the existing policy that Room Participants may manipulate public Game Objects and only an authorized Match Player may inspect or manipulate private Hand and Library contents. A nonplaying observer of a Solo Match remains read-only.
- Make the desktop Match screen viewport-fitted. Four players use a 2×2 arrangement; three use two opponent areas over a wider local area; two use opposing top and bottom areas; Solo uses one full area. Zone drawers may scroll internally. Mobile and tablet layouts are not required.
- Assign accessible Match Player accents independently of card color and Color Identity. Use player names as redundant identifiers. Opponent Hand card backs use the same color family with enough hue or shade difference from the corresponding Player Area.
- Use the available Card Printing artwork for visible Game Objects and the current face where applicable. Preserve redaction for hidden identities. Provide a readable fallback for missing or failed artwork without live per-card catalog lookup during a Match.
- Holding Alt while hovering a visible card shows a full-card image; ordinary click selects; drag moves; double-click and T toggle tapped state. Keyboard shortcuts must not fire while a text control has focus. Keep a contextual menu for common actions and a detailed inspector for uncommon state.
- Keep the local Hand visible along the bottom. Show opponents' Hand counts and concealed backs only. Place the shared Stack centrally and provide compact Zone indicators with drawers near the relevant Player Areas. Keep Life Totals and Turn State controls near their subjects.
- Show the table immediately with guided opening controls. Opening draw is a user-triggered action for seven cards. Add a user-triggered Mulligan action that atomically returns the acting Match Player's Hand to their Library, shuffles, draws seven, and increments that player's Mulligan Count in one accepted Match revision. Initialize each Mulligan Count at zero and allow manual correction. Only the authorized Match Player may use these private-Zone actions.
- The app does not bottom cards, calculate a reduced opening-hand size, enforce a free mulligan, or show a bottoming reminder. Participants handle these rules manually.
- Preserve server-authoritative action ordering, participant-specific Match views, and restoration after reconnect. Adapt existing persisted spatial positions to the new arrangement without dropping Game Objects.
- Do not add undo or action history. Participants correct mistakes through the existing manual actions.

## Testing Decisions

- Test externally observable behavior and Match state, not CSS class names, component boundaries, or a particular coordinate formula. A good test demonstrates what a Room Participant can see or do and what another participant receives, including privacy and recovery.
- Use two test seams. The highest seam is the existing browser-level Match flow: exercise Solo and two- to four-player tables at a laptop viewport, visual layout, card artwork and fallback, Alt-hover, Hand privacy, zoom and pan, card gestures, Zone drawers, opening setup, and synchronized results. Check that the page itself does not require scrolling while drawers can.
- Add focused lower-level Match action tests through the existing direct action/protocol helpers for opening draw and Mulligan atomicity, authorization, count correction, revision behavior, hidden-Zone redaction, explicit Controller changes, Owner preservation, and position changes that do not alter Controller. Keep these tests distinct from the browser interaction tests rather than repeating the same path at both seams.
- Follow the existing tabletop behavior tests for multi-participant actions and privacy, the integrity tests for direct Match action assertions, and the recovery tests for persisted state. Review screenshots of an empty and a populated table at one, two, three, and four players because the core problem is visual usability.

## Out of Scope

- Automatic card type grouping, row arrangement, snapping, stacking, or decorative Battlefield art.
- Rules automation, Priority handling, card-effect resolution, automatic bottoming, free-mulligan calculations, and mulligan reminders.
- Undo, action history, and a new permission model for public Game Objects.
- Mobile phone and tablet Match layouts.
- Reworking Room invitations, Decklist import, or the broader lobby outside controls needed to enter and set up a Match.

## Further Notes

- The prototype screenshots show a fresh Match with full Libraries, empty Hands, and revision zero. The empty first view is therefore both a layout problem and an opening-flow problem.
- The existing Card Catalog already stores printing artwork URLs and the client can render those images, but artwork loading failure has no readable fallback today. The redesign should reuse the imported artwork and maintain participant-specific redaction.
- This spec refines the shared Battlefield decision and the prior Manual Match spec. Guided opening actions remain participant-initiated; they do not introduce rules automation.
- The agreed design summary is in the [tabletop redesign brief](../../docs/tabletop-redesign.md), with canonical terms in the [domain glossary](../../CONTEXT.md) and shared-layout rationale in the [Battlefield Layout decision](../../docs/adr/0010-shared-battlefield-layout.md).
