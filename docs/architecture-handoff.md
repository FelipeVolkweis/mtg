# Architecture discussion handoff

This note captures the current design conversation so it can continue in another session or on another computer. Continue the architecture grilling from the unanswered questions below; do not begin implementation until the user confirms the design is settled.

## Project goal

Build a browser-based multiplayer Magic tabletop for playing with friends. Start with the simplest useful manual game: import Decklists, create a Match, and move cards among Zones. Add rules automation in stages. The long-term goal is to support every Magic card and mechanic, while keeping the initial player group small and leaving room to scale.

The user prefers defining domain behavior before settling implementation details or classes. They favor a common `Zone` base class with specialized Zone types, but want to decide its implementation after defining functionality.

## Settled architecture decisions

- **Manual first:** Players may move cards freely between Zones, draw and shuffle from their own Library, and tap or untap permanents on the Battlefield. Move legality, card effects, and deck legality are not enforced initially.
- **Server-authoritative Match:** The server owns canonical Match state. A card move is submitted when a drag ends; accepted actions are processed in order against the latest state. An action invalidated by an earlier action is rejected. Accepted changes receive a revision.
- **Live updates:** Use a WebSocket connection for actions and server updates. Each player gets a view that respects private Zones.
- **Rooms and players:** Invitation-only Rooms use guest names and support two to four players. There is no host role; participants have equal permissions. Anyone with the invite link may join while there is an open seat. A browser-held random credential lets a guest reclaim their Room Participant after reconnecting; cross-device recovery is deferred.
- **Room lifetime:** A Room and its Decklists can be closed by a participant or expire after inactivity. Make the expiry interval configurable and choose its initial value during implementation.
- **Persistence:** Persist Rooms, their participants' private Decklists, and the active Match. Save the active Match as current state plus a revision, without an action log or completed-Match history. Starting another Match replaces the previous one.
- **Reusable Decklists:** Each Room Participant owns private reusable Decklists. Each selected Decklist creates fresh Card Instances for a Match; match play does not mutate the saved Decklist.
- **First deployment shape:** One backend and one database, organized as a modular monolith with explicit module interfaces. Room owns participants, invitations, and Decklists; Match owns Match Players, Card Instances, Game Objects, Zones, and actions; Card Catalog owns definitions, printings, and imports. Rules behavior starts inside Match and can move to a separate Module when it has a substantive independent interface.
- **Card catalog:** Keep a local catalog; Scryfall is an import/update source, not a per-card runtime dependency. Import the full Scryfall catalog and preserve the information Scryfall provides, including specific sets and arts. Stage rules coverage: every card is usable in Manual Matches; Rules-Automated Matches initially support a mechanics-focused subset. Long-term automation aims to cover every card. Ability data should eventually be structured and authored or compiled offline. Add automated tests as mechanics are implemented.
- **Printings:** Keep Card Definition, Card Printing, Card Instance, and Game Object distinct. Support specific sets, collector numbers, and artwork. Preserve a requested printing in a Deck Entry; if only a card name is given, choose a default printing.
- **Ownership and control:** A Card Instance has an Owner. Its current Game Object has a Controller, and those may differ. In Manual Matches, any participant may manipulate public cards; only the owning Match Player may inspect or manipulate cards in their private Hand and Library. Keep this manual action policy replaceable by rules-based permissions.
- **Zone model direction:** Prefer specialized Zone types sharing a common Zone base class, but finalize the implementation only after Zone functionality is defined.
- **Zone scope and defaults:** Each Match Player has their own Library, Hand, and Graveyard. Battlefield, Stack, Exile, and Command Zone are shared by the Match. Library and Hand are hidden; other Zones are public by default. Visibility may vary for an individual object. Preserve order where it matters.
- **Initial Zone functions:** Library is ordered, hidden, and supports draw/shuffle. Hand identities are private but its count is public. Battlefield is shared, spatial, and supports tap/untap. Graveyard is player-specific, public, and ordered. Exile and Command are shared and public by default. Stack is shared, public, and ordered. Manual moves remain free-form.
- **Card/Game Object identity:** A Card Instance is the stable copy created from a Deck Entry for a Match. A Game Object is the current rules representation in a Zone; moving between Zones generally creates a new Game Object, with exceptions to be modeled as rules require.
- **Stack contents:** The Stack can hold spell Game Objects that refer to a Card Instance and ability Game Objects with no Card Instance. Ability creation and resolution remain manual initially.
- **Battlefield presentation:** All participants share one spatial Battlefield layout. Persist card positions separately from gameplay state so the UI can later change to category-based areas without changing rules behavior.
- **Format and advanced behavior:** Start format-agnostic and do not enforce deck legality. Details such as Aura placement, full zone-specific rules, land/mana behavior, cost modifiers, keyword stacking, ability modeling/resolution beyond generic Stack items, and the full offline card-rules pipeline were deliberately deferred to later grilling rounds.

## Immediate unanswered questions

The user has not yet answered the following questions from the latest round:

- **Q45 — Match setup:** Should each participating Room Participant select a saved Decklist and mark ready? **A.** Any participant can start once two to four are ready; the server creates Match Players and Card Instances in each Library, then players shuffle and draw manually. **B.** Start an empty Match and have players add cards manually. Recommendation: **A**.
- **Q46 — Life totals:** Should a Manual Match track life totals? **A.** Give each Match Player a configurable starting total that participants can adjust. **B.** Defer life totals and focus on cards and Zones. Recommendation: **A**.
- **Q47 — Turn/phase marker:** Should a Manual Match track turns and phases? **A.** Show active Match Player, turn number, and current phase as manually updated markers that do not block actions. **B.** Defer turn and phase tracking until rules automation. Recommendation: **A**.

Ask the user to answer Q45–Q47, then update the docs and continue the next design-tree frontier. Keep implementation details deferred until behavior is clear.

## Domain docs and decisions

- Shared glossary: [`CONTEXT.md`](../CONTEXT.md)
- ADRs: [`docs/adr/`](adr/)
  - `0001` Server-authoritative Match state, ordered actions, WebSocket updates, player-specific views
  - `0002` Private guest Rooms and persistent Room Participants
  - `0003` Manual-first gameplay and permissive card movement
  - `0004` Local Card Catalog
  - `0005` Full catalog with staged rules coverage and mechanic tests
  - `0006` Card Definition, Card Printing, Card Instance, and Game Object
  - `0007` Reusable private Room Decklists
  - `0008` Persisted, reconnectable sessions
  - `0009` Modular monolith and initial Module ownership
  - `0010` Shared Battlefield layout as presentation state
  - `0011` Stack holds spells and abilities

The user initiated this work with `$grill-with-docs`. Continue asking the frontier questions in numbered rounds, include a recommendation for each, record settled concepts in `CONTEXT.md`, and add or update concise ADRs when a consequential trade-off is resolved. The user has not yet confirmed that the design is fully settled. No application code or tests have been run as part of this design discussion.

## Rules reference

The current [Wizards Comprehensive Rules](https://magic.wizards.com/en/rules) informed the Zone scope/visibility notes and the distinction between stable Card Instances and Game Objects that change identity across Zone changes (sections 400 and 405).
