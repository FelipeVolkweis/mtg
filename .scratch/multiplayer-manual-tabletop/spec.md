# Multiplayer Magic Tabletop

Status: needs-info

This functional specification consolidates the decisions recorded through Q58. It defines user-visible behavior and domain requirements; implementation tooling is left for a later discussion.

## Problem Statement

Friends need a shared browser tabletop for playing Magic together. They need to bring in their own decks, represent cards in the right Zones, and see one consistent Match state across players. They also need private card areas to stay private. Requiring complete rules automation before they can play would delay the basic experience, while querying an external card service during every game would make play depend on that service being available.

The game should therefore support manual play first, while its card and Match model leave a clear path toward automated rules. The long-term goal is to support every card and mechanic represented by the card catalog.

## Solution

Provide invitation-only Rooms for small groups. Room Participants join under guest names, keep reusable private Decklists, and can start successive Matches together. A Match begins from selected Decklists and provides a synchronized tabletop with private and public Zones, manual card actions, life totals, turn markers, counters, and a Stack.

Manual Matches leave rules enforcement to the players. They can move cards freely, shuffle and draw, manipulate public cards, and update shared markers. The game maintains a single accepted Match state, protects private information, and restores that state after reconnects.

The Card Catalog is populated from Scryfall and stored locally for use during play. The initial usable card pool can be limited while catalog support is built for the full Scryfall catalog. All catalog cards remain usable in Manual Matches; automated rules support is introduced in stages, with full coverage as the long-term goal.

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

#### Card identity and representation

- A Card Definition represents a card's rules identity independently of edition and artwork. In regular Magic, the canonical card name defines identity; printings with the same name share one Card Definition. For a multi-faced card, the front-face name is canonical and each face's name is stored on its Card Component. Separate gameplay identities for Un-set or silver-border variants are not required.
- A Card Definition stores the card's Color Identity as a rules-defined property distinct from the card's current color.
- A full Card Name Directory is available from the initial release, independently of per-set Card Definition and printing imports. It supports named choices and other name-based features, indexing all rules-recognized alternate or composite names that card-name-choice effects may legally select. Names map to a Card Definition, Card Component, Alternative Characteristics, or composite form when applicable. A name match in the directory does not satisfy the local Card Definition requirement for Decklist import.
- A Card Printing represents a specific set version, collector number, and artwork of a Card Definition. The game supports choosing a specific edition and printing, including multiple arts or variants where Scryfall distinguishes them. Use one default Card Printing as the source for a Card Definition's characteristics; do not model gameplay characteristic differences across alternate printings.
- Card Definitions use a comprehensive game-specific Card Characteristics model for all known game-relevant card fields and forms represented in the catalog, rather than mirroring Scryfall's schema or limiting the model to common forms. Each Card Definition has one or more Card Components; every component uses the same field model, including its face name, for applicable costs, colors, types, subtypes, stats, and abilities. Mana costs store ordered typed symbols and quantities alongside rules text. Component relationships represent forms such as double-faced, split, and Room cards without executing their mechanics. Context-specific alternative values, including an Adventure inset, are stored in a linked Alternative Characteristics record using the same field model. Each record has a composition mode: partial alternatives inherit unspecified values from the linked component where the Comprehensive Rules say they remain unchanged; full alternatives use only their own values in the stated context, and omitted characteristics are absent. A typed relationship records when and how those values apply.
- Card Abilities share a structured representation with a kind and rules text, plus applicable fields such as a trigger, condition, cost, mode, target, variable value and its declarative source data, choice, replacement behavior, delayed triggered ability, effect, and references to relevant card data or Match context. Variable Value Source data describes the source, references and parameters, and Comprehensive Rules timing for determining a value; it is stored as data, not an executable function call. A determined value may be retained as a binding such as X = N on the relevant Game Object or Ability Game Object. Mana symbols and quantities in ability costs and mana-producing effects are stored as ordered typed values. Such references can identify context including the current Controller's Commander and that Commander's Color Identity, or read a chosen value stored on a Game Object. Keyword abilities such as flying, haste, and trample use the same representation. A printed keyword can link to separate structured Card Ability records for each ability defined by the Comprehensive Rules; each record retains its applicable Zone and behavior. Saga chapter abilities store a chapter number on each structured ability; grouped chapter symbols are separate linked abilities, and the final chapter number is derived from the greatest number among applicable chapter abilities. Reusable rules data represents Saga lore-counter and sacrifice behavior. Preserve whether an ability is printed, granted, or derived from a Comprehensive Rules characteristic. Represent rules-derived abilities with reusable rules data keyed to the relevant characteristics, such as the intrinsic mana abilities of the five basic land types. Effect data follows the Comprehensive Rules distinctions, including one-shot, continuous, replacement, and prevention effects, while retaining the card's rules text. Represent an effect as ordered structured parts that can refer to Game Objects and read characteristics using the Comprehensive Rules' current-information or last-known-information rules. A Library Sequence is a reusable declarative effect group that records its source Zone, operation, stop predicate, handling for the selected card and remaining cards, ordering, and no-match behavior. The initial version stores this structured data but does not evaluate or apply effects.
- A Card Instance represents one copy created from a Deck Entry for a Match. It references its Card Definition, selected Card Printing, and Owner, and remains the same owned copy as it moves between Zones.
- Store reusable Token Definitions for all Comprehensive Rules predefined tokens, independently of Card Definitions, using the applicable Card Characteristics and Card Component structures. Token-creation effects reference the relevant definition and preserve effect-specific added or modified characteristics. Other tokens support explicit characteristics or copy-based descriptors. A created token is a Game Object without a Card Instance.
- A Game Object represents a card, token, ability, emblem, or other supported nontraditional object in its current Match state and Zone. It may reference one or more Card Instances or exist without one. Meld is represented by two Card Instances combined into one Game Object with combined characteristics; each instance retains its identity and Owner. Game Objects can also have a manual attachment relationship to another Game Object.
- The Match can store an Object Link from a source Game Object, optionally identifying the Card Ability involved, to related Game Objects, such as the specific object an effect exiles and later refers to. Object Links are separate from attachments and do not execute effects.
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

#### Card Catalog and future rules automation

- Scryfall is the import and update source for the local Card Catalog, not a per-card runtime dependency during a Match.
- A maintainer command accepts a Scryfall set code and imports one set at a time. The initial catalog may begin with a single imported set, and the same command can add further sets. Re-importing a set is idempotent; a failed fetch leaves the last successfully imported data intact.
- A full Card Name Directory is populated independently of the per-set detailed Card Catalog imports and is available from the initial release. Set imports may add names missing from the directory. It indexes all canonical, alternate, or composite names that a card-name-choice effect may legally select under the Comprehensive Rules, mapping to a Card Definition, Card Component, Alternative Characteristics, or composite form when applicable. Directory entries support name-based references but do not count as imported Card Definitions or make cards eligible for Decklist import.
- The long-term catalog targets the full Scryfall card pool and can be populated incrementally. Card data uses a game-specific structured model rather than a direct copy of Scryfall's schema.
- The Card Characteristics model covers all known game-relevant fields and card forms represented in the catalog. A Card Definition has one or more Card Components, each with the same characteristic field model, including the component's name; component relationships describe multi-part card forms. For a multi-faced card, its front-face name is canonical for Decklist import, while all face names index to its Card Definition in the Card Name Directory. Card Definitions carry Color Identity. Card Abilities share one structured representation with kind and rules text, plus applicable trigger, condition, cost, mode, target, variable value and declarative source data, choice, replacement behavior, delayed triggered ability, effect, and references to relevant card data or Match context. Variable Value Source data describes how a value is determined, what card or Match state it references, and the Comprehensive Rules timing; it is stored as data, not an executable function call. A determined value may be retained as a binding such as X = N on the relevant Game Object or Ability Game Object. A printed keyword may link to multiple structured Card Ability records for its constituent Comprehensive Rules abilities, preserving each one's Zone and behavior. Saga chapter numbers belong to structured chapter abilities; represent grouped symbols as separate abilities and derive a Saga's final chapter number from the greatest number among its applicable chapter abilities. Ability and effect data use Comprehensive Rules terminology and distinctions, including one-shot, continuous, replacement, and prevention effects. Store the full applicable structure in the initial catalog; evaluating and applying it is future rules-engine work.
- Preserve rules-defined relationships among Card Abilities, their shared conditions, and associated characteristic changes. This includes Class level bars (their activated and static parts), Leveler and Station thresholds (counter conditions and granted abilities or characteristics), and Cases (the “To solve” triggered ability, solved designation, and solved ability). The data is available before automation; Manual Matches do not evaluate the conditions or apply the abilities or characteristic changes.
- Every card in the local catalog is usable in a Manual Match, whether or not its rules are automated.
- Do not add variant-specific play support for Schemes or Vanguards in the initial version. Generic card information may still be retained when imported, but the model need not represent Vanguard setup modifiers or the Scheme Deck and its lifecycle.
- Store Sticker Sheets and Sticker Definitions as catalog data separate from Card Definitions, Card Components, and Card Characteristics. Each Sticker Definition retains its kind, printed value, and ticket cost when applicable; an ability sticker may refer to shared structured Card Ability data. A Match Player records which sheets are available in that game, and a Sticker Placement relates a Sticker Definition to a Game Object with the ordering needed by the rules. Do not add sticker-specific fields to the shared card record. Ability/effect data may refer to sticker operations, but sticker selection and effects are not automated initially; ticket counters use the existing Counter model.
- For a double-faced Card Definition, store its form kind as modal double-faced, nonmodal double-faced, or meld, and retain structured characteristics for every printed face. Each Match Game Object records its current face; a melded Game Object records the combined face. Record the chosen face when a double-faced card is cast or played as a land. Participants record face choices and changes manually; face-selection legality and face-changing rules are not automated initially.
- A face-down Game Object retains its underlying Card Instance or source object, face-down source or mode, face-down characteristics, applicable turn-up procedures, and visibility permissions. Manual Matches store this data and participants record turn-up actions themselves; the game does not evaluate face-down procedures.
- Triggered Card Ability data identifies an event trigger or a state trigger and stores its corresponding event or game-state condition. This is declarative card data; Manual Matches do not evaluate trigger conditions.
- Rules-automated Matches initially support only cards and mechanics whose behavior is modeled. Unsupported cards remain usable in Manual Matches.
- Rules automation is added in stages. Initial planned mechanics include lands producing mana and spells spending mana when cast. Later coverage must account for cost increases, cost reductions, keywords, and other rule interactions.
- Keyword and ability data should use a common structured representation that a future rules system can interpret. Scryfall's supplied keyword data can help populate that model but does not define its schema.
- The long-term goal is to automate rules for every card. If needed, card rules can be parsed or compiled offline into the game’s own data model so participants do not need live Scryfall access to play.
- Every mechanic added to automated play requires automated tests that verify its behavior and interactions.

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

- Organize responsibilities around Room, Match, and Card Catalog. Room owns Room Participants, invitations, and private Decklists. Match owns Match Players, Card Instances, Game Objects, Zones, actions, and shared table state. Card Catalog owns imported card definitions and printings.
- Keep one authoritative Match state. Participants submit actions; accepted actions are ordered against the current state, assigned revisions, and reflected in participant-specific views. Conflicting stale actions are rejected.
- The action policy for Manual Matches allows manipulation of public objects by participants and limits private Hand and Library inspection and general manipulation to the owning Match Player. The controller of a manual card ability may make a specific known-object move into another player's private Hand or Library when a cost or effect explicitly calls for it. Keep this policy replaceable by rules-based permissions.
- Persist the active Match as current state and revision rather than a full action log. Reconnection returns the latest state with private information filtered for that Room Participant.
- Keep Room Participant identity separate from Match Player identity. A participant can persist across Matches while each Match creates its own Match Player and Card Instances.
- Keep Decklists independent of active Match state and private to their Room Participant.
- Model Card Definition, Card Printing, Card Instance, Game Object, Owner, Controller, and Zone separately. Preserve exact printing selection where provided and use one designated default printing where it is not. Use that default as the characteristic source for each Card Definition; do not store per-printing gameplay overrides. In regular Magic, same-named printings share one Card Definition; for a multi-faced card, the front-face name is canonical.
- Store each double-faced Card Definition's form kind (modal double-faced, nonmodal double-faced, or meld) and every printed face as a Card Component with its full characteristics. Store each Game Object's current face or melded composite face as Match state. Participants choose the face when casting or playing a modal double-faced card as a land and record later face changes manually.
- Represent event and state trigger kinds explicitly on triggered Card Abilities and retain their event or game-state conditions as data. Future rules behavior interprets this structure; Manual Matches do not evaluate triggers.
- Use one typed Zone Change Condition in replacement and triggered Card Ability data. It identifies the moving object, source Zone, destination Zone, and whether the move would occur or has occurred. Keep object eligibility filters separate and reusable; a Zone Change Condition may reference an Object Filter for criteria such as card versus token or a destination Zone belonging to an opponent. Keep a replacement action distinct from the resulting zone change, and keep a triggered ability's effect distinct from its trigger condition. Do not create a Match event history or generic event snapshot for this data.
- Represent each continuous effect as structured typed changes that describe its semantic operations, targets, and value sources. Do not duplicate Comprehensive Rules layer or sublayer labels in card data; a future rules engine derives them from each change's meaning.
- Represent a face-down Game Object with its underlying object reference, source or mode, visible characteristics, applicable turn-up procedures, and viewer permissions. Face-down identities remain in Match state and are redacted from participants who may not inspect them; players perform face-up changes manually.
- Store a Battle Game Object's Protector as a Match Player reference distinct from its Owner and Controller. Manual Matches allow participants to record which Match Player is the Protector; eligibility and selection rules are not enforced initially.
- Store a Casting Record on a spell Game Object. Capture its source Zone and applicable casting choices and payment facts such as chosen X, selected modes or fused split-card halves, alternative or additional costs, and colors of mana spent. Card Ability data identifies the facts it needs. Keep the record or a reference to it available as the spell resolves into a permanent or another Game Object needs it under the Comprehensive Rules. A Game Object put onto the Battlefield without being cast has no Casting Record. Manual Matches record this data without checking or interpreting it.
- Represent Opening-Hand Actions in Card Ability data with their conditions, choices, costs, and actions. Match setup records each action taken after mulligans and before the first turn and its result. Participants carry them out manually; the Match does not enforce the procedure.
- Represent all known game-relevant card fields and forms in a comprehensive game-specific model, independently of Scryfall's schema. A Card Definition has one or more Card Components with the same Card Characteristics field model and carries its Color Identity. Store mana symbols and quantities in Card Component mana costs and Card Ability costs or mana-producing effects as ordered typed values alongside rules text. Card Abilities share a structured representation with a kind and rules text, plus applicable trigger, condition, cost, mode, target, variable value and declarative source data, choice, replacement behavior, delayed triggered ability, effect, and references to relevant card data or Match context. Variable Value Source data describes the source, references and parameters, and Comprehensive Rules timing for determining a value; it is data, not an executable function call. Store a determined value as a binding such as X = N on the relevant Game Object or Ability Game Object when applicable. A printed keyword can link to separate structured Card Ability records for each ability defined by the Comprehensive Rules, including each record's applicable Zone and behavior. Store each Saga chapter number on its structured chapter ability, represent grouped symbols as separate abilities, derive the final chapter number from the greatest number among the Saga's applicable chapter abilities, and use reusable rules data for intrinsic lore-counter and sacrifice behavior. Preserve ability origin as printed, granted, or rules-derived; use reusable rules data to derive abilities from characteristics. Store applicable chosen or captured variable values as bindings such as X = N on the relevant Game Object or Ability Game Object, and use existing Object Links for references to other Game Objects. Represent effects as ordered structured parts with object references and characteristic value sources/timing, including last known information as defined by the Comprehensive Rules. Use the Comprehensive Rules as the terminology and behavior reference; preserve rules text alongside normalized structured data. This data is available before any rules behavior is automated. Manual Matches do not evaluate or apply effects. Live card lookups are not required during play.
- Keep all catalog data availability separate from rules automation coverage. Manual Matches may use all cards; automated Matches enforce only modeled card and mechanic behavior.
- Represent a characteristic-defining ability as a structured static Card Ability that declares the characteristic fields it defines and their value sources. Keep printed stat values such as Tarmogoyf's `*` and `1+*` in Card Characteristics; do not add reverse references from those fields to the ability formulas. Counter-based changes such as Walking Ballista's +1/+1 counters remain separate ability and Match data.
- Give Zones shared behavior while preserving differences in ownership, visibility, ordering, and interaction. The domain direction is a common Zone base with specialized Zone behavior.
- Store Battlefield Layout separately from game rules state. The initial layout is spatial; later layouts may categorize permanents.
- Keep the Stack capable of holding a spell Game Object that references a Card Instance or an activated or triggered Ability Game Object with no Card Instance. Keep that Stack object distinct from its source Card Ability and retain source references where applicable.
- Manual Matches allow participants to create editable token Game Objects with all card-facing characteristics supported by the game model and text-only ability Game Objects on the Stack; players resolve abilities manually.
- Represent the special object types, Zones, supplementary decks, and manual state needed by supported nontraditional card categories; players handle their procedures and mechanics.
- Represent meld as a relationship between two Card Definitions and permit their Card Instances to combine into one Game Object while retaining both instance identities and Owners. Represent attachments as a relationship between Game Objects, without automatic legality checks or positioning behavior.
- Store manual Object Links from a source Game Object, optionally identifying the Card Ability involved, to related Game Objects, separately from attachments and without applying the associated effect.
- Permit the controller of a manually resolved card ability to move a specific known Game Object into another Match Player's private Hand or Library when an explicit cost or effect calls for it. Keep all other contents hidden and owner-managed.
- Store choices on the relevant Game Object so its Card Abilities can refer to them. Card-name choices accept names whether or not they match a Card Name Directory entry or locally imported Card Definition.
- Make the full Card Name Directory available from the initial release, separate from per-set Card Catalog data, so name-based references can be used outside Decklist import. Include every canonical, alternate, or composite name that a card-name-choice effect may legally select under the Comprehensive Rules, mapped to its Card Definition, Card Component, Alternative Characteristics, or composite form when applicable. Index every face name of a multi-faced card to its shared Card Definition; accept only the front-face name as its Decklist identity. A name-directory match alone does not make a card available to a Decklist.
- Manual Matches track Life Totals, Turn State, Counters, and Game Outcome without applying rules effects or blocking otherwise valid manual actions. Participants can navigate phases and steps forward or backward and select them directly for corrections. They can record each Match Player as still playing, won, or lost and the overall Game as ongoing, complete, or a draw.
- Manual Matches store applicable statuses and designations in one typed Rules State collection with distinct variants. A status such as flipped is not stored as a designation, and counters remain separate. Each state kind has a defined value shape and applicability; the initial Match records these values without enforcing their rules.
- Record Sticker Placement as a separate Match relationship to the affected Game Object, including Sticker Definition identity and applicable order. Do not add sticker data fields to Card Characteristics or mutate a Card Definition's base characteristics when a sticker is placed.
- Decklist import accepts pasted line-based entries with quantities and canonical card names, plus optional set code and collector number. For a multi-faced card the front-face name is canonical; a back-face name can support name choices but is not a Decklist alias. Every Card Definition must be available through a locally imported set; an explicitly selected Card Printing must also be locally imported. An unspecified printing resolves only among that definition's locally imported printings. Unresolved and out-of-set entries reject the import.
- A Card Name Directory entry or a Game Object's chosen card name does not make an unimported card eligible for Decklist import.
- A maintainer command imports one Scryfall set at a time by set code; initial population may begin with one set. Re-importing a set is idempotent, and a failed fetch leaves the last successfully imported data intact. Catalog updates happen when a maintainer runs the command; scheduled refresh is not part of the initial release.
- Starting a new Match while one is active requires confirmation from every current Match Player before replacing it.
- If a current Match Player is disconnected, replacement waits until they reconnect and confirm; the active Match remains available meanwhile.
- Full Match play initially targets desktop and laptop PCs; mobile phone and tablet play are out of scope.
- Manual Matches do not formally model Priority or passes, but future rules behavior must be able to represent Priority and pass sequence.
- Start rules behavior within Match until future rules responsibilities have a substantive independent contract.
- Catalog refresh scheduling is not part of the initial release. The initial 100-card sample review is recorded in [`card-model-review.md`](card-model-review.md). It confirms support for special object/Zone forms, meld, structured abilities with contextual references, attachments, Object Links, named choices on Game Objects, name-based card identity in regular Magic, one default characteristic source per card across printings, and a full Card Name Directory independent of set imports. Additional card forms still need review before implementation. Invite-link rotation is not required initially. If a browser credential is lost, the Room name and invitation link are accepted for recovery, with the impersonation trade-off described above.

## Testing Decisions

- Use behavior tests at the Match action seam: submit a participant action and verify the accepted current state, revision, and participant-specific views. Also verify two-client WebSocket synchronization, private-zone redaction, and reconnect/resynchronization in an integration check.
- Test Room workflows through observable behavior: join by invitation, capacity, equal permissions, reconnect identity, late arrival, Room close, and inactivity expiry.
- Test starting a Match with two, three, and four ready participants; verify correct Decklist selection, fresh Card Instances, ownership, initial Libraries, and saved Decklist immutability.
- Test privacy by comparing the owning and opposing participant views for Library, Hand, public Zones, and individually hidden objects.
- Test an effect-directed move of a known Game Object into another Match Player's Hand or Library, verifying that the required card moves while unrelated private contents remain hidden and owner-managed.
- Test valid and stale card actions, draw and shuffle behavior, Zone movement, public-card manipulation, ownership/control distinction, tap state, and Battlefield Layout synchronization.
- Test Graveyard and Stack ordering, and verify that Stack ability objects can exist without Card Instances.
- Test Life Total, Turn State, starting-player selection, adjustable clockwise order, and counter data as manually editable shared state that does not trigger rules effects.
- Test manual Game Outcome updates for individual Match Players and the overall Game, including ongoing, complete, and draw states, without evaluating game rules or card effects.
- Test persistence and reconnect by resuming a Room and active Match and checking the latest revision and redacted state. Verify that starting another Match replaces the active Match while retaining Room Participant and Decklist data.
- Test set import by code, idempotent re-import, preservation of prior data after a failed fetch, coverage of the complete Card Characteristics and Card Component model including ordered typed mana symbols and quantities in costs and mana-producing effects, Card Definition Color Identity, printed, granted, and rules-derived ability origins, reusable characteristic-based ability derivation (including each basic land type's intrinsic mana ability and Saga lore-counter/sacrifice behavior), shared Card Ability records and applicable trigger/condition/cost/mode/target/variable/choice/replacement/delayed-trigger/effect/context-reference data, including one-shot, continuous, replacement, and prevention effect forms and references to a Controller's Commander's Color Identity, multi-ability keyword expansion with each constituent ability's applicable Zone and behavior (including Flashback's Graveyard casting permission and Stack replacement effect), and Saga chapter numbers on separate structured abilities with grouped symbols and a derived final chapter number. Also verify printing selection, exact-printing resolution, resolution to one designated default printing among locally imported printings, name-based identity across same-named printings, and independence from live lookups during play. Manual Matches retain applicable variable bindings such as X = N, Object Links, and ordered effect parts with object references and Comprehensive Rules characteristic timing, without evaluating or applying effects. Alternate printings do not have separate gameplay characteristic overrides. Manual Matches store the full applicable ability/effect structure without evaluating or applying it.
- Verify Tarmogoyf retains printed `*` and `1+*` values in Card Characteristics while its structured static characteristic-defining Card Ability declares the power and toughness value sources; no reverse references from the stat fields to those sources are needed. Verify Walking Ballista retains printed 0/0 characteristics, with its chosen X and +1/+1 counters represented separately.
- Verify Progenitus uses a Zone Change Condition for a would-be move from any Zone to its owner's Graveyard and stores the replacement action that sends it to the Library instead. Verify Emrakul, the Aeons Torn uses the same typed condition shape for a completed move from any Zone to its owner's Graveyard, followed by a separate triggered effect that shuffles that Graveyard into its Library. Preserve the would-move versus has-moved distinction without recording Match events.
- Verify Leyline of the Void and Rest in Peace use separate Object Filters with the shared Zone Change Condition: Leyline filters for cards entering an opponent's Graveyard, while Rest in Peace filters for cards or tokens entering any Graveyard. Keep Rest in Peace's enters-the-battlefield effect separate from its continuous replacement effect.
- Verify Opalescence and Humility store their distinct continuous-effect changes as typed operations (type change, ability removal, and power/toughness setting), without per-card layer or sublayer labels. This checks stored data only; layer classification and effect application remain future rules-engine work.
- Verify computed variable source data retains its source, references and parameters, and Comprehensive Rules timing (for example, Thassa's Oracle's X from its controller's devotion to blue on resolution), and that a determined value can be retained as a binding such as X = N on the relevant Game Object or Ability Game Object. This verifies stored data, not variable calculation or effect automation.
- Verify Card Catalog import records double-faced form kind and full characteristics for each face, and Match state retains the chosen/current face of spell and permanent Game Objects plus the combined face of a melded Game Object. Face selection and changes remain manual in the initial version.
- Verify linked Alternative Characteristics preserve context-specific alternative values with the shared Card Characteristics field model and correctly apply their composition mode. For Phyrexian Fleshgorger, store Prototype's changed mana cost, color, power, and toughness, inherit its unchanged types and abilities from the Card Component, and retain the Prototype choice in the Casting Record and on the resulting Game Object. For Bonecrusher Giant, store Stomp as a full alternative whose characteristics replace the normal ones while it is an Adventure spell; map the name Stomp to that Alternative Characteristics record in the Card Name Directory. Omen spell characteristics and Preparation spell-copy characteristics also use full alternatives. Manual Matches record these facts without applying the mechanics.
- Verify face-down Game Objects retain their underlying object reference, source or mode, visible characteristics, applicable turn-up procedures, and viewer permissions. Cover Morph, manifest or cloak, and face-down exile such as Necropotence; verify that a player who is not allowed to inspect the card receives a redacted view.
- Verify that a Battle Game Object stores a Protector Match Player reference distinct from its Owner and Controller, without enforcing Protector eligibility in a Manual Match.
- Verify Card Catalog import retains event-versus-state trigger kind and the corresponding condition as data, including Garruk Relentless's loyalty threshold state trigger, without evaluating it in a Manual Match.
- Test that a Pithing Needle style named choice is retained on its Game Object and readable by its Card Ability, including when the chosen name is absent from the Card Name Directory and local Card Catalog. Verify that such a name value does not allow the card to be imported as a Deck Entry. Verify that double-faced card face names in the directory map to the same Card Definition while Decklist import requires the canonical front-face name, and that other rules-selectable alternate or composite names such as Adventure names and meld results resolve to their Alternative Characteristics or composite form as applicable without becoming Decklist identities.
- Test manual representation of nontraditional objects and their special Zones or supplementary decks, melded objects retaining both Card Instances and Owners, Game Object attachments, Aura enchant restrictions, structured effects referring to attached objects, reusable predefined Token Definitions with per-token additions or modifications, and explicit or copy-based custom token descriptors.
- Test that Planechase state can contain multiple active Plane Game Objects at once.
- Test creating, changing, and removing Object Links between source Game Objects, their relevant Card Abilities, and related Game Objects, independently of attachment.
- As automation is added, test each mechanic's externally visible behavior, supported-card outcomes, and interactions with other modeled mechanics. Include the initial mana-generation and casting-payment behavior before adding more complex cost modifiers and keyword interactions.
- The repository has no existing application test patterns to follow yet; no prior implementation test seam is available.

- Verify that a spell Game Object's Casting Record retains applicable cast choices and payment facts, including chosen X, fused split-card choices, alternative/additional costs, and mana colors spent. Verify Card Abilities can reference the data as the spell resolves and when the resulting permanent needs it, as with Engineered Explosives's Sunburst counters. Manual Matches store this data without calculating or applying its mechanics.
- Verify that Match setup records Opening-Hand Actions taken after mulligans and before the first turn, including Leyline of the Void beginning on the Battlefield from its owner's opening hand. Participants record the choice and resulting state without automated eligibility enforcement.

## Out of Scope

- Selecting implementation languages, frameworks, databases, libraries, or deployment products.
- Requiring accounts, social login, persistent global player profiles, or stronger Room Participant recovery than a unique Room name plus the invitation link.
- Scaling to millions of users in the first version.
- A host role or host-only Room permissions.
- Enforcing deck construction legality, format legality, turn timing, move legality, or card effects in a Manual Match.
- Automatic ability creation, Priority passing, Stack resolution, or complete rules automation in the first Manual Match.
- Requiring rules automation for a card before it can be used manually.
- A completed-Match archive, replay, or full action history.
- Invite-link rotation, scheduled catalog refresh, and importer operations beyond the repeatable set-code command.
- A categorized Battlefield layout or detailed attachment presentation for Auras and similar cards in the initial layout.
- Exact rules coverage for cost modification, every keyword, and every card during the first automation phase.

## Further Notes

- Answers Q1 through Q63 inform this consolidation. Q52 establishes the reusable declarative Library Sequence group, Q53 adds source Zone to the Casting Record and retains it when the spell becomes a permanent, Q54 settles the linked Alternative Characteristics model, Q55 uses typed Rules State for statuses and designations, Q56 preserves relationships among abilities that share conditions, Q57 excludes Scheme and Vanguard variant support, Q58 keeps sticker data separate from card characteristics, Q59 adds partial-versus-full composition modes for Alternative Characteristics, Q60 keeps characteristic-defining formulas on their Card Abilities without reverse links from stat fields, Q61 shares typed Zone Change Conditions across replacement and triggered abilities, Q62 stores typed continuous-effect changes without layer labels for future engine classification, and Q63 keeps reusable Object Filters separate from Zone Change Conditions.
- The user explicitly wants full Scryfall catalog support and, long term, rules automation for every card. The initial card pool and initial automated rules pool may be limited while the system grows toward those goals.
- The initial visual Battlefield is spatial because card categories have exceptions such as Auras attached to creatures. A later layout may divide categories when those rules and visual requirements are discussed.
