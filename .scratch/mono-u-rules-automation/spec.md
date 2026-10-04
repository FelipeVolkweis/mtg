# Mono-U Rules Automation

Status: ready-for-agent

## Problem Statement

Players currently have to advance phases, pay costs, resolve abilities, manage combat, and apply card effects themselves. The tabletop stores their actions but does not enforce Magic rules. The maintainer wants to play the complete mono-U sample Decklist against an identical Decklist, with the game handling phases and card behavior through reusable, composable rules data. Solo practice must remain available.

The catalog already separates imported Oracle Text from authored primitive-based Card Abilities, but the current primitive envelope does not provide an executable rules engine. The mono-U list contains 100 cards, 67 distinct card names, and 40 lands, including 34 Islands. All 67 Card Definitions are locally available and currently marked `unimplemented`.

## Solution

Replace Manual Matches with Rules-Automated Matches. Deliver complete behavior for the mono-U sample pool, initially for two human Match Players using identical Decklists and for a solo practice session with an inert opponent. Players choose actions, targets, payments, and optional effects; the server enforces legality and performs the resulting rules procedures.

Select Commander as the initial format during Match setup. Each player selects an eligible commander from their Decklist before shuffling and drawing. Sai, Master Thopterist is the intended test commander, without special treatment in engine code. The setup interaction may place the selected card into the Command Zone, while the Match separately retains its commander designation across Zone changes.

Express card behavior as typed, validated JSON compositions of reusable Object Filters, value expressions, costs, trigger conditions, effects, continuous changes, and control-flow constructs. Shared engine code interprets these pieces. The complete Decklist drives the abstractions and delivery acceptance; internal implementation order may follow dependencies without reducing the final coverage target.

## User Stories

1. As a Room Participant, I want to select the Match format during setup, so that the game applies the intended rules.
2. As a Match Player, I want to designate my commander from my Decklist before play, so that Commander-dependent behavior has an explicit source of truth.
3. As a Match Player, I want eligible supported commanders to work without card-specific setup code, so that selecting Sai or Padeem uses the same procedure.
4. As a Match Player, I want commander eligibility and Color Identity checked, so that my selected commander can legally lead my Decklist.
5. As a Match Player, I want my commander placed in the Command Zone before shuffling, so that my opening Library contains the remaining cards.
6. As a Match Player, I want Commander starting life, opening hands, and mulligans handled by the game, so that setup is consistent.
7. As a Room Participant, I want two players to start with identical mono-U Decklists and separate Card Instances, so that each player's cards remain independent.
8. As a Match Player, I want unsupported cards identified before play starts, so that a Match does not promise incomplete behavior.
9. As a Room Participant, I want solo practice retained with an inert opponent, so that I can test the same rules without another human.
10. As a solo player, I want the practice opponent to pass Priority and take no proactive plays, so that practice requires no strategic AI.
11. As a solo player, I want opponent-facing effects and combat to have a real rules recipient, so that practice exercises more than self-directed card movement.
12. As a Match Player, I want the game to advance turns, phases, and steps according to rules, so that I do not manually adjust Turn State.
13. As a Match Player, I want untapping, drawing, and cleanup performed at the correct times, so that turn procedures are reliable.
14. As a Match Player, I want explicit Priority passes, so that I control every legal opportunity to respond.
15. As a Match Player, I want the Stack to resolve only after the required passes, so that responses occur in the correct order.
16. As a Match Player, I want invalid timing and out-of-turn actions rejected, so that shared state remains legal.
17. As a Match Player, I want legal land plays enforced, so that land play limits and casting are treated separately.
18. As a Match Player, I want spells and abilities to expose their legal choices and targets, so that I can complete them correctly.
19. As a Match Player, I want selected targets rechecked during resolution, so that changing game state affects resolution correctly.
20. As a Match Player, I want to choose X where an ability or spell allows it, so that variable costs and effects share the recorded value.
21. As a Match Player, I want cost increases and reductions calculated before payment, so that affinity and artifact discounts compose correctly.
22. As a Match Player, I want to start casting and then activate mana abilities to pay, so that the interface follows normal casting procedures.
23. As a Match Player, I want to produce mana before starting a cast, so that I can prepare my mana pool first.
24. As a Match Player, I want to choose which mana abilities to activate, so that the game does not tap sources on my behalf.
25. As a Match Player, I want existing pool mana spent automatically by a deterministic greedy strategy, so that payment does not require manual allocation.
26. As a Match Player, I want specific mana requirements satisfied before generic costs, so that automatic spending remains legal.
27. As a Match Player, I want generic costs paid from the largest remaining colored quantity before colorless mana, so that automatic spending follows the agreed policy.
28. As a Match Player, I want unused mana and its expiration tracked, so that preproducing mana has its normal consequences.
29. As a Match Player, I want to select objects for tap, sacrifice, discard, and return costs, so that payment respects my decisions.
30. As a Match Player, I want improvise and crew supported through their own payment rules, so that they do not become ordinary mana production.
31. As a Match Player, I want life payments calculated from applicable values, so that War Room uses the selected commander's Color Identity.
32. As a Match Player, I want casting and activation failures handled legally, so that incomplete actions do not leave invalid payments or objects behind.
33. As a Match Player, I want draws and discards performed in their stated order, so that later choices can use newly drawn cards.
34. As a Match Player, I want scry and Library inspection to reveal information only to the permitted player, so that hidden information remains private.
35. As a Match Player, I want selected Library cards and remaining cards handled with their specified ordering, so that Adaptive Omnitool resolves correctly.
36. As a Match Player, I want bounce, retrieval, exile, destruction, and sacrifice to retain their distinct rules, so that related abilities trigger correctly.
37. As a Match Player, I want counterspells to enforce their target restrictions, so that Counterspell, Negate, and Launch Mishap differ correctly.
38. As a Match Player, I want mass effects to act on the appropriate object sets, so that AEtherize, Nevinyrral's Disk, and All Is Dust resolve correctly.
39. As a Match Player, I want spells and abilities to do as much as their rules permit, so that partially possible instructions resolve correctly.
40. As a Match Player, I want reusable token definitions and explicit token characteristics, so that Thopters, Myr, and the living-weapon Germ are created correctly.
41. As a Match Player, I want Equipment and Auras attached through legal actions, so that their effects apply to the intended recipient.
42. As a Match Player, I want activated abilities to remain on the Stack when their source leaves, so that sacrificing or returning a source does not erase its pending ability.
43. As a Match Player, I want entering, dying, casting, drawing, attacking, and combat-damage triggers detected automatically, so that I do not create Ability Game Objects manually.
44. As a Match Player, I want simultaneous triggers ordered through the proper player choices, so that the Stack reflects the rules.
45. As a Match Player, I want conditional triggers checked at their required times, so that Padeem and Thopter Spy Network behave correctly.
46. As a Match Player, I want state-triggered abilities handled separately from ordinary event triggers, so that Mazemind Tome triggers correctly.
47. As a Match Player, I want entry replacements applied before the entry completes, so that tapped-entry permanents never enter untapped first.
48. As a Match Player, I want dependent follow-up effects to use the result of the preceding action, so that an 'if you do' effect requires its actual prerequisite.
49. As a Match Player, I want artifact counts and other live values evaluated at the appropriate rules time, so that characteristic and cost calculations stay accurate.
50. As a Match Player, I want continuous bonuses, base-stat changes, granted abilities, and Counters to compose, so that Graaz and artifact synergies work together.
51. As a Match Player, I want temporary effects to expire at their stated duration, so that crew and unblockability do not persist indefinitely.
52. As a Match Player, I want source-based effects to stop applying when appropriate, so that removing a permanent updates effective characteristics.
53. As a Match Player, I want Duplicant to retain its linked exiled card, so that its characteristics use the correct association.
54. As a Match Player, I want damage, life loss, and life gain treated distinctly, so that damage sources and draw-based life effects behave correctly.
55. As a Match Player, I want flying, hexproof, indestructible, ward, and flash enforced, so that imported keyword names correspond to real behavior.
56. As a Match Player, I want attacks and blocks declared legally, so that combat uses current characteristics and restrictions.
57. As a Match Player, I want attack requirements and attack payments composed, so that Juggernauts and Propaganda interact correctly.
58. As a Match Player, I want attacking destinations changed only when an effect allows it, so that Misleading Signpost follows its timing and constraints.
59. As a Match Player, I want combat damage assigned and applied by the game, so that damage and combat triggers are consistent.
60. As a Match Player, I want combat-damage triggers to distinguish individual creatures from 'one or more' grouping, so that Research Thief and Thopter Spy Network differ correctly.
61. As a Match Player, I want per-turn draw ordinals remembered, so that Thopter Fabricator recognizes my second draw.
62. As a Match Player, I want relevant combat-damage recipients and activation usage remembered, so that Steel Hellkite's ability uses the correct history and limit.
63. As a Match Player, I want monarch ownership and its associated rules automated, so that Fall from Favor works beyond its printed entry effect.
64. As a Match Player, I want maximum Hand size changes honored during cleanup, so that Thought Vessel works correctly.
65. As a Match Player, I want commander tax, return choices, and combat-damage losses enforced, so that Commander is a functioning format.
66. As a Match Player, I want state-based actions and game outcomes evaluated at the correct checkpoints, so that creatures and players leave the game when required.
67. As a Match Player, I want shared selection controls for costs, targets, and effect choices, so that different cards use a consistent interface.
68. As a Match Player, I want a pending choice to identify who must answer and what is being decided, so that resolution is understandable.
69. As a Match Player, I want casting, resolution, and pending choices restored after reconnecting, so that a disconnect does not restart or duplicate an operation.
70. As a Match Player, I want server validation and private player views retained, so that automation preserves shared-state integrity and hidden information.
71. As a Match Player, I want gameplay actions limited to legal rules actions, so that unrestricted manual edits cannot bypass enforcement.
72. As a card-data author, I want typed reusable pieces with validated parameters, so that invalid behavior is rejected before a Match uses it.
73. As a card-data author, I want nested sequences, branches, choices, and bindings, so that complex abilities remain declarative.
74. As a card-data author, I want shared keyword and ability templates, so that recurring behavior is implemented once.
75. As a card-data author, I want missing operations added to the shared engine, so that new cards extend reusable behavior instead of introducing card-name branches.
76. As a maintainer, I want all abilities of each card tested before marking it implemented, so that automation status remains meaningful.
77. As a maintainer, I want representative interactions tested through the same interface players use, so that tests validate functioning gameplay.
78. As a maintainer, I want imported facts and authored abilities to remain separately owned, so that catalog refreshes preserve reviewed behavior.
79. As a maintainer, I want complete mono-U coverage checked as a release condition, so that difficult cards are not silently deferred.
80. As a maintainer, I want reusable engine behavior to support future Decklists, so that this first supported pool does not become a collection of bespoke scripts.

## Implementation Decisions

- Preserve the server-authoritative Room and Match architecture, ordered command processing, revisions, persisted state, and participant-specific projections. Replace manual gameplay permissions and commands with validated rules actions.
- Remove Manual Match functionality from the final product rather than maintaining a parallel manual mode. Retain Room invitations, guest identity, saved Decklists, card presentation, and useful table navigation. Presentation changes must not mutate rules state.
- The release target is the complete mono-U pool in two-player mirror Matches. Unsupported cards cannot enter Rules-Automated Matches. Catalog availability and Decklist storage remain distinct from automation eligibility.
- Introduce explicit format configuration in Match setup, initially supporting Commander. Validate the relevant Decklist construction and commander requirements. Commander selection is a setup choice from the selected Decklist, performed before shuffling and opening hands; moving a card into the Command Zone records the designation as part of this procedure.
- Commander designation belongs to the Card Instance and survives Game Object replacement and Zone changes. Any eligible fully supported commander uses the same mechanism. Sai is the initial test selection. Padeem is another eligible commander for the unchanged sample; Graaz's Color Identity does not cover that blue Decklist.
- Apply ordinary Commander rules for two-player play, including opening procedures, turn-order-dependent first draw, commander tax, applicable command-zone return procedures, and commander combat-damage tracking. Keep commander count and references representable without making additional commander mechanics a release requirement.
- Preserve solo practice as one human participant controlling their seat with an inert practice opponent as an additional Match Player. The practice opponent automatically passes Priority, makes no proactive casts or activations, and uses the same rules engine. Provide a coherent practice setup and Library so mandatory draws do not immediately end practice. Required choices use the shared choice machinery under the solo practice controller; do not introduce a strategic AI.
- Put setup, turn-based actions, Priority, casting, activation, Stack resolution, combat, state-based actions, and outcomes in a shared rules module. Its interface accepts a command against current Match state and produces accepted state changes, visible results, or a pending input request; rejected commands do not create an invalid committed state.
- Treat casting, activation, and resolving effects as resumable procedures. Persist the procedure context, source references, selected modes and targets, Variable Value bindings, casting/payment facts, current progress, and pending choices. Waiting for input does not grant another player a new Priority opportunity during a procedure.
- Human Match Players explicitly pass Priority at every legal opportunity. Determine resolution and step advancement from the rules and pass sequence. Reset passes when appropriate. Mana abilities and turn procedures retain their rules-specific handling; they are not ordinary Stack resolution merely because the UI performs an action.
- Support producing mana before casting and activating legal mana abilities during the casting payment window. Calculate and lock total cost at the prescribed point, including cost increases, reductions, and chosen variables. Preserve the distinction between cost modification, mana production, and payment methods such as improvise.
- Players explicitly select mana abilities and objects used for nonmana payment. The engine never automatically activates a source to fill a missing amount. Existing pool mana is allocated without prompting: satisfy specific colored and colorless requirements first, then pay generic requirements from the largest remaining colored-mana quantity, then colorless. Group quantities by mana type, preserve rules-relevant restrictions or provenance, and use a documented stable tie ordering. Track unused mana and rules-defined pool expiration.
- Validate complete costs and preserve legal payment ordering. Reject or reverse illegal incomplete procedures according to rules, including restrictions on reversing mana abilities and information-revealing operations. A canceled or rejected action cannot duplicate resources, expose otherwise hidden cards, or leave a half-cast spell as a completed cast.
- Expand authored Card Ability data into a typed declarative structure with Object Filters, player/object references, value expressions, targets, costs, conditions, effects, continuous changes, applicability, and duration. Support nested ordered sequences, choices, conditionals, repetition over selected sets, and bindings to action results. This extends the existing flat primitive envelope rather than encoding structure inside arbitrary text parameters.
- Maintain a shared primitive registry whose validation and execution agree. Unknown operations, invalid parameters, invalid bindings, and structurally invalid compositions cannot count as supported behavior. Card definitions contain data, not executable per-card functions; missing behavior is added to reusable engine code.
- Choose rules-level operations such as draw, discard, sacrifice, destroy, damage, life loss, life gain, counter, token creation, attachment, and Zone movement. Share lower-level implementations where appropriate while preserving the semantic differences that restrictions, replacements, and triggers observe.
- Costs and effects may reuse underlying actions, but execute in distinct contexts. Master Transmuter's return is a cost; its optional Battlefield placement is an effect. Mana payments during an effect, such as Mind's Eye, are also distinguished from paying a spell's casting cost.
- Use reusable filters for characteristics, Zone, ownership, control, relationships, self/other exclusion, and eligible object sets. Keep the timing at which characteristics are inspected in the consuming trigger, target, condition, value expression, or effect. Resolve dynamic counts and use captured values or last known information at their prescribed rules times.
- Use a shared data-driven choice interface for targets, quantities, modes, object selections, ordering, optional actions, and payments. Supply the authorized responding player, applicable constraints, legal options, and explanatory context. Validate answers against the current procedure; private choices must not reveal other hidden state. Ordered effects can create later choices from their updated state, as in Thirst for Knowledge.
- Semantic game actions produce the information needed for trigger detection and replacements. Apply replacement behavior before the affected action occurs. Preserve event grouping, affected objects, source/controller references, and relevant pre-change information. State triggers and state-based actions are separate procedures. Collect and order waiting triggers at legal checkpoints; do not check state-based actions between every instruction of a resolving spell or ability.
- Preserve Card Instance identity while creating new Game Objects on ordinary Zone changes as required by rules. Pending Ability Game Objects retain enough source information to resolve after their source leaves. Keep Object Links separate from Attachments, particularly for Duplicant.
- Keep active Continuous Effects separate from printed Card Characteristics. Derive effective characteristics centrally using the required layers, ordering, dependencies, applicability, and durations. Card data specifies typed changes rather than duplicating layer labels. Combine characteristic-defining values, base-stat changes, additive bonuses, Counters, type changes, grants, and restrictions correctly.
- Add structured combat state for attackers, defending players or permanents, blockers, assignments, damage, and applicable restrictions/payments. Support attack requirements, flying, unblockability, restrictions involving Walls, and legal redirection. Preserve the difference between damage and direct life loss.
- Keep the bounded current-turn facts required by supported cards, including draw ordinal, combat-damage attribution, and activation usage. Expire them at the relevant turn transition. Transient trigger information and these facts do not require a full persisted action history or event-sourced Match storage.
- Provide reusable rules or templates for intrinsic land mana abilities, cycling, affinity, equip, living weapon, crew, improvise, flash, flying, hexproof, indestructible, and ward as used by this pool. Imported keyword names alone remain insufficient to mark a card implemented.
- Model monarch as shared Match rules with its designation and associated draw/transfer behavior. Apply hand-size changes during cleanup. Entry modifications, temporary effect expiration, and conditional untap restrictions are required by the selected pool.
- Keep binary automation status and explicit review: a card remains `unimplemented` until every applicable ability, keyword, and interaction is covered. Catalog imports preserve authored behavior and status, and Oracle identity continues to join printings to Card Definitions.
- Implement in dependency order, but accept the feature only when the entire selected pool is supported. Update domain documentation and superseding ADRs during implementation: manual-first play is being retired, explicit Priority is being introduced, and solo practice now uses a practice opponent. Retain the established server authority, JSON catalog ownership, general Stack objects, and reconnectable-session decisions.
- Do not silently reinterpret persisted Manual Matches as legal automated state. Preserve saved Room and Decklist data, identify legacy active Matches as requiring replacement, and use the existing consent procedure for replacing an active Match. Legacy manual play is not retained as an executable mode.

## Testing Decisions

- Prefer one highest-level gameplay seam: the existing server command and participant-view interface used by Room clients. Submit real setup/gameplay commands and assert resulting public and authorized private state, pending choices, rejection behavior, and revisions. Avoid tests coupled to evaluator recursion, handler registration order, internal caches, or private helpers.
- Test setup, legal actions, payment, resolution, continuous effects, combat, game outcomes, and reconnects through that shared seam. Use controlled initial states and randomness in test fixtures to reach meaningful scenarios without playing an entire game for every assertion; do not expose unrestricted fixture manipulation as a gameplay feature.
- Existing tabletop tests establish prior art for two-player synchronization, isolated Card Instances, participant views, stale actions, hidden information, solo starts, and active-Match replacement. Existing recovery tests establish persisted-state and server-restart coverage. Adapt these contracts to automated gameplay and remove expectations that arbitrary manual state edits remain allowed.
- Existing catalog acceptance tests establish prior art for temporary catalog roots, real import/consumer behavior, authored-data preservation, and invalid provider data. Extend their observable coverage to typed composition validation and automation eligibility without modifying the reviewed catalog during tests.
- Use focused browser tests for the interactive flows that server-state assertions cannot verify: format/commander setup, explicit passes, both mana-payment workflows, shared choice controls, and resuming a visible pending prompt. Avoid duplicating all rules scenarios as slow browser tests.
- Verify the complete Decklist resolves to 100 physical cards and 67 distinct Card Definitions, and that every definition has complete supported authored behavior before the feature is accepted. Test each card's distinct behavior and share tests for reused rules; imported keywords and a nonempty ability list must not alone satisfy the eligibility gate.
- Verify separate identities and controller/owner relationships in mirror Matches, commander designation across Zones, legal and illegal commander choices, and preservation of hidden information during choices and effects.
- Verify both payment workflows with affinity, artifact cost reducers, improvise, variable costs, and nonmana payments. Verify that cost is locked before later payment actions alter the board. Verify automatic mana spending reserves specific symbols and chooses largest colored quantities before colorless for generic costs, with deterministic ties, unchanged unused mana, and no automatic source activation.
- Verify partial or invalid payments, stale choices, and illegal casting attempts cannot duplicate mana, leave partially committed costs, or produce triggers from reversed actions. Exercise legal reversal limitations rather than assuming every action can be freely undone.
- Put Lonely Sandbar and Nevinyrral's Disk onto the Battlefield through effects as well as normal play; verify their tapped-entry behavior is applied during entry, distinct from a subsequent trigger.
- Activate Mazemind Tome at three page counters; verify its fourth-counter state trigger, Stack placement, source-independent pending activation, and conditional life-gain follow-up.
- Return Ichor Wellspring to Hand as Master Transmuter's cost and select that same Card Instance during resolution. Verify that the return does not trigger its Graveyard condition, reentry triggers its draw, and the resulting permanent has a new Game Object identity.
- Resolve Thirst for Knowledge and Pull From Tomorrow through their draw-then-discard choices, including insufficient remaining Library or Hand contents. Verify legal partial effects and private information, and exercise Adaptive Omnitool's selection, reveal, remaining-card ordering, and no-selection cases.
- Combine Graaz with artifact creature bonuses, Equipment, and +1/+1 Counters; verify types, base values, and additive changes. Exercise Psychosis Crawler with Hand-size changes during one resolving spell to ensure state-based checks are not inserted between effect instructions.
- Exercise grouped combat damage with Research Thief, Thopter Spy Network, and Steel Hellkite. Verify per-creature versus grouped trigger counts, damaged-player attribution, chosen X, and activation limits. Exercise Misleading Signpost during the applicable step and with illegal attack destinations.
- Verify Propaganda payment and mandatory attacks together, crew and summoning restrictions, flying/blocking legality, ward payment and countering, indestructible versus sacrifice, and hexproof target restrictions.
- Verify Padeem and Thopter Spy Network conditions at the required trigger/resolution times, Thopter Fabricator's second draw, Forsaken Monument's additional mana, Thought Vessel cleanup, and monarch transfer/draw/untap behavior.
- Restart the server or disconnect during a cast, a resolving effect choice, and trigger ordering. Verify that the same player resumes the same procedure without duplicate costs, effects, or hidden-information disclosure.
- Verify solo practice uses the same legal-action and resolution behavior with automatic practice-opponent passes, permits opponent-facing interactions, and does not end immediately merely because it was started by one human.

## Out of Scope

- Automated support for the mono-B sample or arbitrary unsupported opposing Decklists.
- Three- or four-human-player Matches in the initial release, while preserving general player references and relationships in the design.
- Additional formats and variant-specific card mechanics outside the selected pool, including partner/background setup and supplementary-deck variants.
- A strategic AI opponent, automated selection of mana sources, automatic human Priority passes, or automatic decisions for human optional effects.
- Continued Manual Match functionality, unrestricted manual edits to gameplay state, or translating old manual board snapshots into verified legal automated states.
- Automatic translation of Oracle prose into authored executable compositions, per-card executable scripts, or live external card/rules queries during play.
- A universal card language implemented beyond the capabilities actually required by the selected pool. In particular, unrelated prevention and delayed-trigger mechanics need not be implemented solely for future extensibility; the schema and shared engine remain extensible.
- Full action-history persistence, completed-Match archives, deterministic replay as a product feature, catalog-revision pinning, or historical printing-specific gameplay differences.
- Competitive matchmaking, tournament administration, or live ban-list synchronization.

## Further Notes

- This spec synthesizes the completed design discussion. The requested publication proceeds without another interview. The testing seam follows the agreed server-owned rules interface and the project's existing command/view acceptance-test pattern.
- The selected coverage source is [`sample-decklists/mono-u.md`](../../sample-decklists/mono-u.md). Card requirements below were checked against the locally imported Card Definitions and Oracle Text. The Card Catalog remains the source of authored behavior; this table is a coverage checklist, not an alternate executable representation.
- This feature intentionally supersedes [ADR-0003: Manual-first gameplay](../../docs/adr/0003-manual-first-gameplay.md) and the manual-only portions of the current domain glossary. It refines [ADR-0011: General Stack objects](../../docs/adr/0011-general-stack-objects.md) with actual Priority and resolution and [ADR-0013: Solo practice](../../docs/adr/0013-solo-practice-matches.md) with an inert opponent. The Room still has one human participant in solo practice.
- Preserve [ADR-0001: Server authority](../../docs/adr/0001-server-authoritative-match-state.md), [ADR-0008: Persisted reconnectable sessions](../../docs/adr/0008-persisted-reconnectable-sessions.md), [ADR-0014: Versioned catalog records](../../docs/adr/0014-versioned-card-catalog-records.md), and [ADR-0015: Oracle identity](../../docs/adr/0015-oracle-identity-for-card-definitions.md). The full supported pool is the staged-coverage target established by [ADR-0005](../../docs/adr/0005-full-catalog-staged-rules-coverage.md).
- Relevant rules references are the [Wizards Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf): casting and payments in 601–602, state triggers in 603.8, mana abilities in 605, continuous and replacement effects in 613–614, state-based actions in 704, illegal-action reversal in 733, and Commander in 903. In particular, state-based actions do not run during every instruction of resolution, and command designation persists across Zones.

### Complete Mono-U Coverage Checklist

| Card | Required behavior and reusable capabilities |
| --- | --- |
| Lonely Sandbar | Tapped entry; blue mana; cycling with mana/discard costs and draw. |
| Darksteel Citadel | Artifact land; colorless mana; indestructible. |
| Foundry of the Consuls | Colorless mana; mana/tap/sacrifice costs; two flying Thopter tokens. |
| Island | Intrinsic basic-land blue mana ability. |
| Remote Isle | Tapped entry; blue mana; cycling with generic mana/discard costs. |
| Buried Ruin | Colorless mana; mana/tap/sacrifice costs; targeted artifact-card retrieval. |
| War Room | Colorless mana; mana/tap/life costs; commander Color Identity value; draw. |
| Sol Ring | Multi-unit colorless mana production. |
| Soul-Guide Lantern | Entry exile target; tap/sacrifice costs; opponent Graveyard sets; alternate draw activation. |
| AEther Spellbomb | Mana/sacrifice costs; targeted creature bounce; separate draw activation. |
| Adaptive Omnitool | Equip and Attachment; artifact-count bonus; attached-creature attack trigger; private top-six inspection; optional selection/reveal; randomized bottom ordering. |
| Counterspell | Spell target and counter operation. |
| Etherium Sculptor | Controlled artifact-spell generic-cost reduction. |
| Ichor Wellspring | Entry or Battlefield-to-Graveyard trigger; draw. |
| Myr Retriever | Death trigger; another artifact card in own Graveyard; targeted retrieval. |
| Silver Myr | Creature tap-symbol legality; blue mana. |
| Negate | Noncreature-spell target filter; counter. |
| Ornithopter of Paradise | Flying; creature tap-symbol legality; chosen-color mana. |
| Mind Stone | Colorless mana; mana/tap/sacrifice draw activation. |
| Pull From Tomorrow | Chosen X and variable cost; X draws followed by discard. |
| Thought Vessel | Colorless mana; maximum Hand size modification. |
| Arcane Signet | Mana-color selection constrained by commander Color Identity. |
| Steel Overseer | Tap-symbol legality; +1/+1 Counters on all controlled artifact creatures. |
| Mazemind Tome | Tap and counter-addition costs; scry or mana-paid draw; state trigger; self-exile with success-dependent life gain. |
| Fall from Favor | Aura target/Attachment; entry tap and monarch acquisition; monarch-dependent untap restriction. |
| Cultivator's Caravan | Chosen-color mana; crew selection by total power; temporary artifact-creature change. |
| Chief of the Foundry | Continuous bonus to other controlled artifact creatures. |
| Nettlecyst | Living weapon; Germ creation then Attachment; equip; artifact-or-enchantment count without double-counting an object. |
| Foundry Inspector | Controlled artifact-spell generic-cost reduction. |
| Launch Mishap | Creature-or-planeswalker spell filter; counter followed by Thopter creation; target legality on resolution. |
| Tamiyo's Logbook | Mana/tap draw activation; generic activation-cost reduction based on other controlled artifacts. |
| Master of Etherium | Artifact-count characteristic-defining power/toughness; bonus to other controlled artifact creatures. |
| Shimmer Myr | Flash; artifact casting permission grant. |
| Palladium Myr | Creature tap-symbol legality; multi-unit colorless mana. |
| Misleading Signpost | Flash; declare-attackers-step entry condition; optional targeted attack-destination reselection; blue mana. |
| Propaganda | Attack restriction with per-attacker generic payment. |
| Sai, Master Thopterist | Artifact-cast trigger; Thopter creation; mana/two-artifact sacrifice costs; draw. |
| Scrawling Crawler | Upkeep draw for each player; opponent-draw trigger; life loss to that drawing player. |
| Thirst for Knowledge | Three draws then choice between artifact discard and two-card discard. |
| Thopter Fabricator | Flying; second-draw-per-turn history and trigger; Thopter creation; crew. |
| Vedalken Archmage | Artifact-cast trigger; draw. |
| Hedron Archive | Multi-unit colorless mana; mana/tap/sacrifice costs; two draws. |
| Nevinyrral's Disk | Tapped entry; mana/tap costs; simultaneous destruction of artifacts, creatures, and enchantments. |
| AEtherize | Attacking-creature set; return each to its owner's Hand. |
| Whirler Rogue | Entry creation of two Thopters; two-artifact tap costs; targeted temporary unblockability. |
| Padeem, Consul of Innovation | Hexproof grant to controlled artifacts; conditional upkeep draw using greatest artifact mana value, including ties. |
| Thopter Spy Network | Conditional upkeep Thopter; grouped artifact-creature combat-damage trigger; draw. |
| Master Transmuter | Mana/tap/return costs; resolution-time optional artifact-card selection from Hand; Battlefield placement without casting. |
| Thoughtcast | Artifact affinity; two draws. |
| Darksteel Juggernaut | Indestructible; artifact-count characteristic-defining stats; attack requirement. |
| Research Thief | Flash and flying; individual artifact-creature combat-damage triggers; draw. |
| Memory Guardian | Artifact affinity; flying. |
| Forsaken Monument | Colorless-creature bonus; triggered additional colorless mana; colorless-cast life gain. |
| Mind's Eye | Opponent-draw trigger; optional mana payment during resolution; success-dependent draw. |
| Psychosis Crawler | Hand-size characteristic-defining stats; draw trigger; life loss to each opponent. |
| Skysovereign, Consul Flagship | Flying; entry or attack damage trigger; opponent creature/planeswalker targets; crew. |
| Kappa Cannoneer | Improvise; ward payment/counter trigger; own or other controlled-artifact entry trigger; Counter and temporary unblockability. |
| Steel Hellkite | Flying; temporary power bonus; X payment; combat-damaged-player history; mana-value-matching destruction; once-per-turn activation limit. |
| Shimmer Dragon | Flying; artifact-count conditional hexproof; two-artifact tap costs; draw. |
| Duplicant | Optional targeted nontoken-creature exile; Object Link; linked creature-card characteristic reads; retained Shapeshifter type. |
| Spire Golem | Island affinity; flying. |
| Myr Battlesphere | Entry Myr creation; optional attack-time Myr selection/tapping; bound quantity; temporary power and damage to current defending player or planeswalker. |
| Meteor Golem | Entry trigger; opponent nonland-permanent target; destruction. |
| Thought Monitor | Artifact affinity; flying; entry two-card draw. |
| All Is Dust | Each-player controlled colored-permanent selection; simultaneous sacrifice. |
| Graaz, Unstoppable Juggernaut | Juggernaut attack requirement and Wall-blocking restriction; other-creature base 5/3 and additive Juggernaut type. |
| Broodstar | Artifact affinity; flying; artifact-count characteristic-defining stats. |
