# Multiplayer Magic Tabletop

Status: ready-for-agent

This specification covers the invitation-only Room, reusable Decklist, and synchronized Manual Match experience for desktop and laptop PCs. The detailed Card Catalog import and rules-ready card data contract is specified separately in [Card Catalog and Data](../card-catalog-data/spec.md).

## Problem Statement

Friends need a shared browser tabletop for playing Magic together. They need to bring in their own decks, represent cards in the right Zones, and see one consistent Match state across players. They also need private card areas to stay private. Requiring complete rules automation before they can play would delay the basic experience, while querying an external card service during every game would make play depend on that service being available.

The game should therefore support manual play first, while its card and Match model leave a clear path toward automated rules. The long-term goal is to support every card and mechanic represented by the card catalog.

## Solution

Provide invitation-only Rooms for small groups. Room Participants join under guest names, keep reusable private Decklists, and can start successive Matches together. A Match begins from selected Decklists and provides a synchronized tabletop with private and public Zones, manual card actions, life totals, turn markers, counters, and a Stack.

Manual Matches leave rules enforcement to the players. They can move cards freely, shuffle and draw, manipulate public cards, and update shared markers. The game maintains a single accepted Match state, protects private information, and restores that state after reconnects.

The Card Catalog supplies local card data to Decklists and Matches. Its set-code import and comprehensive data model are defined in the [Card Catalog and Data spec](../card-catalog-data/spec.md). Manual Matches do not require card mechanics to be automated.

### Initial release acceptance

The first playable release supports an end-to-end Manual Match set up from a Room and its participants' Decklists. Participants can manipulate cards and shared Match state, see synchronized participant-specific views, and reconnect to the persisted Match. Manual Match state includes Life Totals, Counters, and a Turn State that participants can update manually: active Match Player, turn number, phase, and step. Participants can advance or go back through phases and steps, and directly select a phase or step to correct the marker. Turn State remains informational and does not restrict actions. Rules automation and completed-Match history are not required for this release. Full play targets desktop and laptop PCs; mobile phone and tablet play are out of scope.

### Functional behavior

#### Rooms and participants

- A Room is private and entered through an invitation link.
- A guest chooses a name when joining and does not need a persistent account.
- Room Participant names are unique within a Room.
- Room Participants have equal permissions; there is no host role.
- A Room supports groups of two to four Match Players. Anyone with the invitation link may join while a seat is available.
- A Room Participant who joins during an active Match waits for the next Match.
- A browser-held random credential lets the same guest reclaim their Room Participant after reconnecting. If that credential is unavailable, the guest can reclaim the participant by providing the same Room name while holding the invitation link. Reclaiming an existing participant restores that participant's seat, even when the Room has no open seats.
- Name-based recovery is a convenience check, not strong identity proof: anyone holding the invitation link and knowing a participant's name can reclaim that identity and access its private Decklists and participant-specific Match view. This trade-off is accepted initially.
- The invitation link remains valid until the Room closes or expires; invite-link rotation is not required initially.
- A Room and its Decklists remain available until a participant closes the Room or it expires after 30 days without meaningful Room or Match activity. The duration is configurable. Connection keepalives do not count as activity.

#### Decklists and starting a Match

- Each Room Participant owns private, reusable Decklists that are independent of any Match.
- Decklists contain card quantities and may identify exact Card Printings. When no printing is specified, the game uses one default Card Printing designated for that Card Definition from its locally imported printings.
- Decklist-based import is the primary way to bring cards into a player's collection. Participants paste a line-based list with a quantity and card name, optionally identifying an exact printing by set code and collector number. Every card must resolve to a Card Definition available through a locally imported set. A multi-faced card's front-face name is its canonical Decklist name; back-face names can support name choices but are not accepted as Decklist aliases. If a line specifies a printing, that exact Card Printing must also be locally imported; otherwise the entry is out of set and the whole import is rejected. If no printing is specified, use the one default Card Printing designated for that definition. Unresolved entries reject the import. Importing cards one at a time is not required as the normal workflow.
- Each Room Participant who will play selects a saved Decklist and marks ready.
- Any Room Participant may start a Match when two to four participants are ready. Participants who have not selected a Decklist and marked ready are not included in that Match.
- Starting a Match creates a Match Player and fresh Card Instances in that player's Library for every selected Deck Entry. It does not change the saved Decklist.
- Players shuffle and draw manually after the Match starts.
- If no Match is active, any Room Participant may start a Match when two to four participants are ready. If a Match is active, every current Match Player must confirm before a new Match replaces it. If any current Match Player is disconnected, the active Match remains in place and replacement waits for that player to reconnect and confirm. Completed-Match history is not required initially.

#### Match state and shared actions

- The Match has a single authoritative current state. Accepted actions are applied in order against that state, assigned an increasing revision, and reflected in all participants' views.
- A card drag is committed when the participant releases the mouse button. The game confirms the resulting action to all participants.
- An action that is no longer valid against the latest Match state is rejected; the participant receives the current view so the action can be retried.
- Manual Matches permit free-form card movement without enforcing card, deck, Zone, timing, or effect legality.
- Participants can manually record each Match Player as still playing, won, or lost, and the overall Game as ongoing, complete, or a draw. These Game Outcomes do not result from automatic evaluation of game rules or card effects.
- Any Room Participant may manipulate public Game Objects. Only the Match Player who owns a private Hand or Library may inspect its contents or manipulate cards already in it. When a manual card cost or effect explicitly directs a specific known Game Object into another Match Player's private Hand or Library, the ability's controller may make that one move without exposing or changing the other contents; the owner remains responsible for inspecting and managing the rest of the Zone.
- Card Owner and Game Object Controller are distinct. A Card Instance retains its Owner when control changes; Controller can be represented separately and changed when the game state calls for it.
- Visibility normally follows the Zone, with per-object variation available for cases such as face-down cards.

#### Zones

- Each Match Player has a private Library, private Hand, and public Graveyard.
- The Battlefield, Stack, Exile, and Command Zone are shared by the Match.
- The Library is ordered and hidden from opponents. Opponents can see its count; its owner can inspect and manipulate it in a Manual Match. Players can shuffle their own Library and draw from it.
- The Hand hides card identities from opponents while showing its count.
- The Battlefield is a shared, public, spatial play area. Cards may be positioned, moved, tapped, and untapped manually.
- Battlefield positions are shared visual state stored separately from gameplay state. The initial presentation is spatial; the model should permit a later categorized layout.
- The Graveyard is public and ordered per Match Player. Its order is preserved when cards are moved into or within it.
- Exile and Command Zone are public and shared by default.
- The Stack is public, shared, and ordered. It may contain spell Game Objects that reference Card Instances and activated or triggered Ability Game Objects that have no Card Instance of their own. An Ability Game Object is distinct from its source Card Ability and may retain references to that Card Ability and its source Game Object, applicable variable bindings such as X = N, and Object Links to relevant Game Objects.
- Participants can create editable token Game Objects with all card-facing characteristics supported by the game model and add text-only ability Game Objects to the Stack. They resolve spells and abilities themselves in Manual Matches; the game does not apply their effects automatically.
- Participants can record choices required by a card on its Game Object. A chosen card name may be any name, even if it is not present in the local Card Catalog; the choice remains manual and does not add that card to the Match. Game Objects can retain applicable variable bindings such as X = N for their abilities to reference.
- Match setup records Opening-Hand Actions taken after mulligans and before the first turn, along with their resulting state. Participants perform these actions manually.
- A spell Game Object carries a structured Casting Record with its source Zone and relevant casting choices and payment facts, including the colors of mana spent. Card Abilities can read those recorded facts when needed, including as the spell resolves into a permanent. A Game Object put onto the Battlefield without being cast has no Casting Record.
- The Match can represent nontraditional game objects and the special Zones or supplementary decks they require, including their manual state. This includes objects such as emblems, Dungeons, planes, phenomena, conspiracies, Attractions, and Contraptions. Their mechanics, progression, and variant-specific procedures are handled by players.
- Special game areas can hold multiple active objects of the same kind when a variant permits it, such as multiple simultaneously active Planes in Planechase.
- Zone behavior has shared requirements as well as variation by Zone kind. Specific future placement rules, such as placing Auras under the objects they enchant, are deferred.

- A Card Definition represents the regular-Magic identity shared by cards with the same canonical name, regardless of printing. For a multi-faced card, the front-face name is the Decklist identity. The Card Catalog spec defines full name indexing and characteristic data.
- A Card Instance represents one copy created from a Deck Entry. It retains its Card Definition, selected/default Card Printing, and Owner as it moves between Zones. A Game Object is the current Match entity and may reference one or more Card Instances or exist without one.
- A Game Object can combine two Card Instances as a melded object while preserving both identities and Owners. It can also have a manual attachment to another Game Object or an Object Link to a related Game Object; attachments and Object Links are separate relationships.
- The Match stores the current face, face-down state, relevant choices, Casting Record, variable bindings such as X = N, and manual Rules State where applicable. Face choices and changes are recorded by participants; the Match does not enforce their rules.
- Manual Matches can represent tokens and nontraditional game objects, including their required special Zones or supplementary decks. Players administer their mechanics and variant procedures themselves. Scheme and Vanguard play procedures are not required.
- The model distinguishes Card Definition, Card Printing, Card Instance, Game Object, Owner, Controller, and Zone so later rules can express their separate meanings.

#### Life, turn order, turn state, counters, and Stack

- Each Match Player has a configurable starting Life Total and a manually editable current Life Total.
- Turn State records the active Match Player, turn number, current phase, and current step. Participants may move forward or backward through phases and steps, or select a phase or step directly to correct the marker. It is informational and does not block actions in a Manual Match.
- Participants choose the starting player by rolling dice. Turn order proceeds clockwise by default and can be adjusted.
- Counters may be associated with a Game Object or Match Player. Counter kinds include numeric/stat counters such as +1/+1 and -1/-1 and category counters such as flying.
- Counter quantities have no one-digit limit and support positive or negative integer values. Counter kinds and quantities are represented independently so multiple counters can coexist.
- Counters are manual markers in a Manual Match; they do not change characteristics or apply effects automatically.
- Manual Matches do not formally track Priority or pass sequences. Participants coordinate when to add to or resolve the Stack themselves.
- The Match model must leave room for a later rules-automated Match to track explicit Priority and player pass sequences.

- Use the local Card Catalog during play; Matches do not depend on live Scryfall lookups. The catalog begins with one imported set code and can add sets later. Every Catalog Card is usable in a Manual Match regardless of future rules-automation coverage. The catalog, name directory, import contract, and comprehensive rules-ready data model are specified in [Card Catalog and Data](../card-catalog-data/spec.md).

#### Persistence and recovery

- Rooms, Room Participants, saved Decklists, and the active Match persist across disconnects.
- A Room Participant can reconnect with the browser credential or, if it is unavailable, reclaim the identity by providing the same Room name while holding the invitation link.
- Reconnecting restores the current Room and active Match state, including its latest revision and the returning participant's correctly redacted view.
- The active Match is stored as current state plus a revision. A complete action log and completed-Match history are not required initially.
- Room inactivity expiry defaults to 30 days since meaningful Room or Match activity and is configurable. Connection keepalives do not reset expiry.

### User Stories

#### Rooms and participation

1. As a player, I want to create a private Room, so that I can invite friends to play together.
2. As a player, I want to share an invitation link, so that friends can join without finding a public lobby.
3. As a guest, I want to join with a chosen name and no account, so that I can start playing quickly.
4. As a Room Participant, I want my identity within the Room to persist across Matches, so that I do not have to rejoin as a new guest each time.
5. As a Room Participant, I want equal permissions with the other participants, so that the Room does not depend on a permanent host.
6. As an invited guest, I want to join when a seat is available, so that a Room can reach its intended group size.
7. As a participant who joins during a Match, I want to wait for the next Match, so that the active Match remains limited to its selected players.
8. As a Room Participant, I want to reclaim my identity with my browser credential or my unique Room name while holding the invitation link, so that I can recover my seat after reconnecting or losing the credential.
9. As a Room Participant, I want to close a Room or let it expire after 30 days without meaningful activity, so that abandoned Rooms and their private data do not persist indefinitely.
10. As a returning Room Participant, I want the same Room and its Decklists to remain available between Matches, so that friends can play rematches without rebuilding their setup.

#### Decklists and card selection

11. As a player, I want to import cards through a Decklist, so that I can prepare a deck without adding every card individually.
12. As a player, I want to specify card quantities in a Decklist, so that repeated copies become the correct number of cards in my Match.
13. As a player, I want to select an exact set printing or art when desired, so that my deck uses the version I own or prefer.
14. As a player, I want an unspecified card entry to resolve to a default printing, so that a simple Decklist does not require set details for every card.
15. As a Room Participant, I want my saved Decklists to remain private and reusable, so that opponents do not see my deck before or between Matches.
16. As a Room Participant, I want a Match to use a copy of my selected Decklist, so that shuffling and playing cards never mutate my saved list.
17. As a player, I want the game to support multiple editions, collector numbers, and available art variants, so that Scryfall-supported printing choices are preserved.

#### Match creation and table state

18. As a Room Participant, I want to select a Decklist and mark myself ready, so that the group can see who is prepared to play.
19. As a Room Participant, I want any participant to be able to start once two to four players are ready, so that the group does not wait for a designated host.
20. As a Match Player, I want my Decklist entries created in my Library when the Match begins, so that I can shuffle and draw manually.
21. As a Match Player, I want to choose the starting player by rolling dice, so that the group can settle turn order simply.
22. As a Match Player, I want the default turn order to proceed clockwise and be adjustable, so that the table can follow its agreed multiplayer order.
23. As a Match Player, I want a configurable starting Life Total and manual life adjustments, so that the shared table can track life without rules automation.
24. As a participant, I want to move forward or backward through phases and steps, or select them directly, so that everyone can follow and correct the table's progress.
25. As a participant, I want turn markers not to restrict manual actions, so that turn tracking remains useful without enforcing turn rules.
26. As a participant, I want to move a card when I release the mouse after dragging it, so that one completed gesture becomes one shared table action.
27. As a participant, I want to see accepted Match changes in a consistent order, so that all players agree on the same current state.
28. As a participant, I want a stale or conflicting action to be rejected with the latest Match view, so that earlier accepted moves are not silently overwritten.

#### Zones, cards, and privacy

29. As a Match Player, I want my own Library, Hand, and Graveyard, so that those card areas follow the normal per-player structure.
30. As a participant, I want the Battlefield, Stack, Exile, and Command Zone to be shared, so that these public game areas are visible to the whole table.
31. As a Match Player, I want opponents to see my Library count but not its cards or order, so that hidden information stays private.
32. As a Match Player, I want opponents to see my Hand count but not its cards, so that hidden-hand privacy is preserved.
33. As a Match Player, I want to inspect and manipulate my own private Hand and Library in a Manual Match, so that I can perform the manual actions needed to play.
34. As a participant, I want to shuffle my Library and draw from it, so that I can perform those common game actions manually.
35. As a participant, I want to move cards freely among Zones in a Manual Match, so that the table supports the full range of manually administered effects.
36. As a participant, I want to create editable token Game Objects and move public objects freely, so that the table can represent tokens and does not require an owner to perform every shared move.
37. As a participant, I want individual objects to be hidden when appropriate even in an ordinarily public Zone, so that face-down and similar states can be represented.
38. As a participant, I want each card's Owner to remain distinct from its current Controller, so that borrowed and controlled cards are represented correctly.
39. As a participant, I want the shared Battlefield arrangement to synchronize and persist, so that every player sees where cards are placed.
40. As a participant, I want to tap and untap Battlefield permanents manually, so that the table can record their state without applying card rules.
41. As a player, I want graveyard order to be visible and preserved, so that the table can refer to the sequence of cards there.
42. As a participant, I want the Stack to hold spells and text-only ability objects, so that it can represent the kinds of objects Magic places there.
43. As a participant, I want to add and resolve Stack objects manually, so that we can play before Priority and ability resolution are automated.
44. As a participant, I want the Battlefield presentation to be changeable later without changing gameplay state, so that a spatial table can eventually support categorized layouts.
45. As a participant, I want to link a source Game Object and its relevant Card Ability to related Game Objects, so that effects that refer to objects such as exiled cards remain associated without rules automation.
#### Counters and rules progression

46. As a participant, I want to add and remove typed counters on Game Objects and Match Players, so that I can record counters relevant to a manual game.
47. As a participant, I want to distinguish +1/+1, -1/-1, and category counters such as flying, so that different counter kinds remain identifiable.
48. As a participant, I want counter quantities to support arbitrary signed whole-number values, so that the game does not impose an artificial one-digit cap.

#### Game outcomes

49. As a participant, I want to record each Match Player's status and the overall Game outcome manually, so that the Game can end without rules or card effects being automated.
50. As a participant, I want manual counters not to change card characteristics automatically, so that they remain markers until their mechanics are implemented.
51. As a player, I want all catalog cards to be usable in a Manual Match, so that lack of automation does not block a card from being played.
52. As a player, I want automated Matches to identify which cards and mechanics are supported, so that automated behavior is only promised where it exists.
53. As a player, I want lands to produce mana and spells to spend mana in a future rules phase, so that basic mana play can be automated first.
54. As a player, I want future cost increases, cost reductions, keywords, and other mechanics to compose correctly, so that rules coverage can grow without limiting the long-term goal.
55. As a player, I want card information available locally in a comprehensive game-specific structure, so that play does not depend on live external card lookups.
56. As a player, I want the long-term rules system to cover every card in the catalog, so that the game can eventually automate complete Magic games.
57. As a developer of future mechanics, I want automated behavior tests for each mechanic and its interactions, so that expanded rules coverage can be validated.

#### Recovery and continuity

58. As a disconnected player, I want the active Match to resume from its latest saved state, so that a dropped connection does not force the group to restart.
59. As a returning player, I want to receive only the information I am allowed to see, so that reconnection does not expose another player's Hand or Library.
60. As a Room Participant, I want a new Match to replace the prior active Match while preserving the Room and Decklists, so that rematches are easy without introducing Match history yet.

#### Manual card resolution into private Zones

61. As the controller of a manual card ability, I want to move the specific Game Object its cost or effect directs into another player's Hand or Library without opening that Zone, so that the action is recorded while private contents stay hidden.
62. As a participant, I want to record a double-faced Game Object's chosen or current face, so that the Match shows the face cast, played as a land, or reached through a manual face change.
63. As an authorized participant, I want a face-down Game Object to retain its underlying object and face-down procedure while the view hides its identity from unauthorized players, so that hidden information and later face-up changes are represented accurately.
64. As a participant, I want a Battle Game Object to record its Protector Match Player separately from its Owner and Controller, so that the Match represents who protects the Battle.
65. As a participant, I want a spell Game Object to retain its source Zone, casting choices, and payment facts, so that abilities can refer to them after casting or resolution.
66. As a participant, I want to record Opening-Hand Actions after mulligans and before the first turn, so that the Match reflects the state established by those card abilities.

## Implementation Decisions

- Keep the product responsibilities around Room, Match, and Card Catalog. Room owns Room Participants, invitations, and private reusable Decklists. Match owns Match Players, Card Instances, Game Objects, Zones, actions, and shared table state. Card Catalog owns imported card records and name lookup; its detailed contract is in [Card Catalog and Data](../card-catalog-data/spec.md).
- Keep Room Participant identity distinct from Match Player identity. A Room Participant persists across rematches; each Match creates its own Match Players and Card Instances.
- Give Room Participants equal permissions; there is no host role. Rooms support two to four players and invitation-link entry. A browser-held random credential is the normal recovery method. If it is lost, the invitation link plus the same Room name is accepted as a convenience check, with the agreed impersonation risk.
- Keep Decklists private to their Room Participant and separate from Match state. Text import resolves only against locally imported Card Definitions and locally imported printings. Reject the complete import if any entry is unresolved or outside the imported pool. Card identity, printing defaults, and the Card Name Directory are detailed in the Card Catalog and Data spec.
- Starting a Match copies the selected Decklist into fresh Card Instances in each Match Player's Library and leaves the saved Decklist unchanged. A new Match replaces an active one only after every current Match Player confirms; if a player is disconnected, wait for reconnection and confirmation.
- Keep one authoritative current Match state. Apply accepted actions in order, assign increasing revisions, and send participant-specific views. Reject stale actions with the latest permitted view. Persist the current state and revision rather than a complete action log.
- Commit a card drag on mouse release. Keep the initial presentation and positions on a shared spatial Battlefield; store Battlefield Layout separately from rules state so presentation can change later.
- Manual Matches allow free-form movement and do not enforce card, Decklist, Zone, timing, turn, or effect legality. Any participant may manipulate public Game Objects. The owner controls general inspection and manipulation of their private Hand and Library. A participant resolving a manual card cost or effect may move the specific known Game Object it directs into another player's private Hand or Library without exposing other contents.
- Represent each Zone's ownership, visibility, order, and interaction while sharing common Zone behavior. Preserve per-object visibility exceptions for hidden and face-down states.
- Keep Owner and Controller distinct. A Card Instance retains its Owner; a Game Object's Controller can change independently.
- Keep spell Game Objects and Ability Game Objects distinct from their source Card Abilities. An Ability Game Object can exist on the Stack without a Card Instance and can retain source, choice, variable binding, and Object Link references.
- Record manual Match state for current face or melded form, face-down information and inspection permissions, choices, Casting Records, applicable variable bindings, attachments, Object Links, Rules State, and Sticker Placements. The data model contract is detailed in the Card Catalog and Data spec; Manual Matches store it without evaluating the related mechanics.
- Support editable token Game Objects and nontraditional objects with the special Zones or supplementary decks needed to represent them. Meld can combine two Card Instances into one Game Object while retaining each identity and Owner. Attachments and Object Links remain separate relationships. Players administer variant procedures; Scheme and Vanguard play support is excluded.
- Keep stickers decoupled from the base Card Definition and Card Characteristics. Store Sticker Sheets and Sticker Definitions separately, and record each Match Player's available sheets and ordered Sticker Placements as Match data.
- Track Life Totals, Turn State, Counters, and Game Outcome as manually editable shared Match state. Turn State records the active Match Player, turn number, phase, and step; participants can move it forward or backward and select a phase or step directly. It never restricts actions. Counter kinds and arbitrary signed integer quantities are data only and do not alter characteristics.
- Use dice to choose the starting player; turn order is clockwise by default and adjustable. Let participants record individual Match Player statuses and an overall ongoing, complete, or draw Game Outcome.
- Persist Rooms, participants, Decklists, and active Match state across disconnects. Reconnection restores the latest revision and only the returning participant's permitted information. Room expiry defaults to 30 days after meaningful Room or Match activity and is configurable; keepalives do not count as activity.
- Target the initial full-play experience at desktop and laptop PCs.

## Testing Decisions

- Prefer tests of observable behavior at the highest useful seam. Do not couple acceptance tests to internal classes, database layout, or implementation details.
- Use one end-to-end browser-to-server acceptance seam through Room creation and guest join, Decklist import and readiness, Match creation, manual card and shared-state actions, private-information views, reconnect, and rematch replacement. Verify synchronization and revision handling as seen by participants.
- Cover the two-to-four-player range, Decklist rejection for unresolved or out-of-set entries, private Hand and Library visibility, effect-directed moves into another player's private Zone, face-down redaction, manual Life Total/Turn State/Counter/Game Outcome changes, disconnect recovery, and all-player confirmation before replacing an active Match within that flow.
- The Card Catalog import/data contract has its own integration seam in [Card Catalog and Data](../card-catalog-data/spec.md), including set-code import, idempotent re-import, failed-fetch preservation, and resolution of locally imported card names.
- The repository currently has no application source, test suite, or established test seam to reuse. These acceptance seams are new; no test prior art exists in the codebase yet.

## Out of Scope

- Mobile phone and tablet play in the initial release.
- Persistent accounts, social login, public lobbies, a host role, or stronger guest identity recovery than the agreed Room-name convenience check.
- Enforcing deck construction or format legality, turn timing, card movement legality, Priority, triggered abilities, or card effects in a Manual Match.
- Requiring rules automation before a card can be used in a Manual Match.
- Completed-Match history, replay, or a full action history.
- Invite-link rotation, scheduled catalog refresh, and automated catalog updates; the separate Card Catalog and Data spec defines the initial set-code import command.
- A categorized Battlefield layout or automatic attachment placement and legality checks in the initial release.
- Scheme and Vanguard variant procedures.

## Further Notes

- The accepted Card Catalog and rules-ready data decisions live in [Card Catalog and Data](../card-catalog-data/spec.md). Room, Decklist, Match, privacy, and manual-play behavior remain specified here.
- The card-sample discussion is retained as supporting evidence in [card-model-review.md](card-model-review.md), not as an implementation specification. Discussion was stopped at Q66; the remaining names in the sample list were not individually reviewed.
- The initial Battlefield is spatial because card categories and attachments have exceptions. A later layout may add categorized presentation without changing Match rules state.
