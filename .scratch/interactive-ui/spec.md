# Interactive UI for Rules-Automated Matches

Status: Implemented and verified following the user's explicit implement request.

## Confirmed requirements

- Build a clear, usable top-down UI for the existing Rules-Automated Match mechanics. Gameplay remains governed by the existing rules engine. Report any apparent need for rules changes during planning.
- Use ordinary Card Printing images; elaborate cosmetics, keyword icons, and complex animations are out of scope.
- Give each Player Area a distinct color. Arrange lands at the lower left, creatures toward the front, artifacts and enchantments at the lower right in separate type groups, and planeswalkers and battles to the right of creatures in separate type groups.
- Display commanders in the Command Zone beside the right end of the Hand with a visible gap and commander tax.
- Show the Stack on the right when nonempty; it may overlay the Battlefield.
- Show mana quantities in color-coded circles.
- Clicking a card opens a menu beside it for activated abilities. Clicking outside the menu closes it.
- Place each player's Graveyard and Exile beside their Library.
- Show combat relationships: attackers, attacked players or objects, and blockers.
- Dragging from the Hand onto the Battlefield initiates the existing casting procedure when allowed. Preserve existing confirmations and cost-payment mechanics.
- Arena screenshots supplied by the user are visual references, not gameplay specifications.

## Design tree

1. Scope: supported devices and Match modes.
2. Presentation: viewer orientation, automatic type grouping versus manual placement, overlapping types, crowded areas, attachments, and changed characteristics.
3. Actions: drag initiation, ability menus, targets, payment, pending choices, cancellation, and explicit Priority passes.
4. Inspection: public-zone browsing, hidden information, card enlargement, current characteristics, commander identity and location, and Stack details.
5. Completion: agree on acceptance criteria and confirm shared understanding before implementation.

## Existing constraints

- CONTEXT.md defines Player Area as a visual portion of the shared Battlefield, not a separate Zone. Library is the canonical term for the in-game deck.
- ADR-0001 keeps the server authoritative and participant views private.
- ADR-0016 specifies explicit human Priority passes; Solo Practice automatically passes for its inert Practice Opponent.
- ADR-0017 supersedes ADR-0010's free-placement policy for this UI with automatic Battlefield Groups. Layout remains presentation state.
- The current Rules-Automated Match setup supports two humans, or one human with a Practice Opponent. The older generic match model's larger player count does not establish automated multiplayer support.
- RulesTabletop currently renders text zones and action/procedure controls rather than an image-based draggable board.
- Existing persisted positioning is gated by Priority and the absence of a pending procedure. Automatic grouping must not submit repositioning actions or require changes to those engine gates.
- Exile is currently a shared game Zone. Per-player Exile displays must be views of that Zone rather than new rules Zones.

## Settled interview decisions

- Desktop first. Prefer dragging and a small number of controls; add another gesture only where there is a clear usability reason.
- Automatically group Battlefield permanents, with no manual placement or rearrangement.
- Display each permanent once with current-type precedence: creature, planeswalker, battle, land, artifact, enchantment. Visually associate attached Auras and Equipment with their host.
- The UI is an interface to existing gameplay only. It must not introduce automatic Priority passes, payment decisions, or other gameplay automation.
- After cast initiation, highlight legal targets for click selection. Use one compact panel for the current required choice, cost payment, confirmation, and cancellation where the existing procedure allows it.
- Build combat declarations by clicking an individual creature and then its legal defender or attack assignment. Show relationship lines, allow editing the draft, and submit only through an explicit Confirm attacks/blocks control.
- Clicking a Graveyard or Exile pile opens a scrollable card drawer with counts and readable images. Preserve Graveyard order and permit outgoing drags only for engine-provided legal actions.
- When a commander leaves the Command Zone, retain a small Hand-side status placeholder showing its current location and tax for the next Command Zone cast. Show the actual card in its current Zone; the Command Zone card is draggable only when legally castable.
- Within a Battlefield Group and Player Area, group only same-name permanents with equivalent current power/toughness, counters, buffs, attachments, and other status. Tapped and untapped copies form separate piles. Show the shared visible state and copy count on the collapsed pile; clicking expands individually selectable members. Individual object identity is retained for every action.
- First clicking a collapsed pile expands it. Clicking an individual member normally opens its ability menu; during targeting or combat selection it selects that member instead. Click outside to collapse, except while an assignment is being made.
- Present the Stack as a compact overlapping column on the right, clearly marking the next object to resolve. Clicking an entry shows its card or ability text, source, and targets. Scroll internally and preserve access to Battlefield targets.
- Use one explicit Pass Priority control with explanatory text about whether consecutive passes will resolve the top Stack object or advance the step. No automatic human passes.
- Each viewer sees their own Player Area at the bottom, with cards upright. Show names, life, mana, Hand count, Library/Graveyard/Exile counts, and a compact commander-damage readout near the relevant Player Area.
- Preserve a minimum readable card size, with internal scrolling for crowded groups. Display current stats, counters, tapped state, and attachments alongside printings.
- Only Alt + hover enlarges a visible card. Show the printing beside the card when space permits, reposition it to remain within the viewport, and include current game values alongside it. Release Alt to dismiss it. Respect hidden information in all previews.

## Acceptance criteria

- Existing two-human Commander and Solo Practice workflows remain usable, including opening Hand/mulligans, required choices, payment, combat, Priority, and Match outcomes.
- Layout, pile expansion, drawers, and previews change presentation only. No rules behavior or automatic human gameplay decisions are added.
- Dragging a legal card dispatches the existing engine-provided action and uses its pending procedure. Illegal drops do not move a card into a new gameplay Zone.
- Same-name copies with differing state remain separate; expanded copies can receive distinct targets, abilities, and combat assignments.
- Ability menus close on outside clicks; required selection modes take precedence over opening a menu.
- Combat lines reflect draft assignments before confirmation and engine state after confirmation.
- Battlefield, Hand, Stack, expanded piles, and drawers remain usable on desktop/laptop viewports, including crowded cases.
- Private cards remain concealed and face-down identities are never revealed without engine permission.
- Alt previews stay within the viewport and disappear when Alt is released.
- Verify the frontend with typechecking/build and focused browser checks covering casting/payment, menu dismissal, pile selection/combat, previews, and private information.

## Scope boundary

Graveyard/Exile drawers are included; casting from them is available only if the engine supplies a legal action. The current engine does not support those casting origins. Enabling them is rules work outside this UI implementation and must be reported rather than silently added.

## Implementation and verification

The user confirmed implementation through the implement skill invocation. The browser UI and existing participant command/view protocol are the agreed verification seams; focused tests cover dragging, payment/reconnect, ability-menu dismissal, equivalent-copy piles, individual combat assignments, face-down privacy, Stack targeting and departed sources, Alt previews, and a 104-card expanded pile.

Both standards and spec reviews are recorded in [implementation-review.md](implementation-review.md). No server rules code or shared gameplay model changes were required. Typechecking, the production build, and all 183 tests passed before the requested commit.
