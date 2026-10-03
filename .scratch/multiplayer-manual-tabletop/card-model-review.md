# Card Model Review

Status: needs-info

Input: [`card-sample.md`](../../card-sample.md), 100 named examples.

## Coverage the current model can express

- Core printed characteristics: mana costs, colors and color indicators, supertypes/types/subtypes, rules text, power/toughness, loyalty, defense, and other applicable stats. Examples include basic and snow lands, Dryad Arbor, planeswalkers, Invasion of Zendikar, and the variable-stat cards.
- A single Card Ability representation for keyword, activated, triggered, and static abilities, with rules text and applicable trigger, condition, cost, mode, target, variable value, replacement/delayed behavior, effect, and contextual reference data. This is stored data; it does not execute the effect.
- One or more Card Components for independently meaningful printed parts such as split-card halves, Room halves, and double-faced card faces. Linked Alternative Characteristics records cover partial and full alternative values such as Prototype, Adventures, Omen, Preparation, and older flip cards. Both use shared Card Characteristics fields; typed relationships distinguish alternative values from separate faces and transformations.
- Printing-specific details such as set, collector number, art, and variants, in addition to shared card characteristics.

The 100 examples cover single-faced cards, lands with multiple types, variable and alternate costs, modal spells, Auras and Equipment, vehicles, counters, Sagas, battles, planeswalkers, transform cards, split cards, Adventures, and several nontraditional card categories. The review prompted decisions to extend the glossary and spec with structures for meld, nontraditional objects and Zones, richer abilities, and attachments.

## Gaps exposed by the sample

### Meld links multiple Card Definitions

Bruna, the Fading Light and Gisela, the Broken Blade, and Urza, Lord Protector with The Mightstone and Weakstone, are meld pairs. A melded permanent is one Game Object represented by two cards. One Card Definition with multiple Card Components cannot express the cross-definition relationship or the combined component on its own. The model needs a data relationship between the two Card Definitions and their combined characteristics; the initial Manual Match can leave the act of melding to players. [Wizards Comprehensive Rules, section 712](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Eldritch Moon release notes](https://magic.wizards.com/en/news/feature/eldritch-moon-release-notes-2016-07-08).

### Some catalog entries describe nonstandard objects or game areas

The sample includes a token (Marit Lage), an emblem (Chandra, Awakened Inferno Emblem), a dungeon (The Undercity), a plane (Tazeem), a phenomenon (Spatial Merging), conspiracies (Worldknit and Your Fate Is Thrice Sealed), an Attraction (Balloon Stand), and a Contraption (Dogsnail Engine). Tokens and emblems are not ordinary cards; Dungeons, planes, phenomena, and conspiracies have special command-zone or outside-the-game roles. Dungeons also contain rooms connected by paths, while Planechase uses a planar deck. Attractions use a supplementary deck and printed visit indicators; Contraptions use sprockets. [Wizards Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Commander Legends: Battle for Baldur's Gate mechanics](https://magic.wizards.com/en/news/feature/commander-legends-battle-for-baldurs-gate-mechanics), [Unfinity mechanics](https://magic.wizards.com/en/news/feature/unfinity-mechanics-2022-09-20), [Unstable design article](https://magic.wizards.com/en/news/making-magic/un-ending-saga-part-2-2017-11-13).

The earlier Game Object and Zone definitions only covered ordinary multiplayer play. The agreed model now also represents tokens, emblems, abilities, nontraditional card objects, and the special-zone or supplementary-deck state needed by the sample, without automating the relevant procedures.

### Name identity and default printing data

The user decided that, for regular Magic, a card's name defines its identity and same-named printings share one Card Definition. Separate gameplay identities for Un-set or silver-border variants are out of scope. The sample includes an Attraction, whose visit indicators can differ between versions; the catalog will use one default printing's data rather than model those differences per printing. Exact set/collector selections can still identify an edition. [Unfinity mechanics](https://magic.wizards.com/en/news/feature/unfinity-mechanics-2022-09-20), [Unfinity release notes](https://magic.wizards.com/en/news/feature/unfinity-release-notes-2022-10-07).

### Attachments and linked abilities are relationships between Game Objects

Pacifism and Animate Dead (Auras), plus Skullclamp and Sword of Fire and Ice (Equipment), require the model to associate an attached Game Object with the object it enchants or equips. The attachment can remain manual and need not affect Battlefield placement, but the relationship itself should be representable. Detailed visual placement remains a separate question.

Oblivion Ring is not an Aura; its abilities refer to the object exiled by its enters-the-battlefield ability. The user confirmed that a general Object Link should preserve such associations from a source Game Object, optionally identifying the relevant Card Ability, to affected Game Objects. This reusable relationship can cover many cards and is different from attachment; it remains manual.

### Effects that reveal a sequence from a Library

The Prismatic Bridge reveals cards from the top of its controller's Library until it finds a creature or planeswalker card. It puts that card onto the Battlefield and the other revealed cards on the bottom of the Library in a random order. If no card matches, it reveals the entire Library, randomizes it, and leaves it there. Related library sequences such as cascade, discover, and hideaway differ in what they inspect and where the selected card goes, so the shared data shape must preserve those distinctions. Q52 settled on a reusable declarative Library Sequence group. Participants perform its steps manually. [Kaldheim Release Notes](https://magic.wizards.com/en/news/feature/kaldheim-release-notes-2021-01-22), [Wizards Comprehensive Rules, rules 701.20, 701.57, 702.75, and 702.85](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

## Next validation pass

Every reviewed card has its own Sample heading; paired cards remain separate records even when they inform the same question. Continue interactive random-card sampling. Q54, Q55, Q56, Q57, Q58, Q59, Q60, Q61, Q62, and Q63 are settled. Q64 is open.

## Decisions settled

1. The first Manual Match model must represent special card/object types and their required special Zones or supplementary-deck state; mechanics and progression remain manual.
2. Meld must be representable as two Card Instances combining into one Game Object with combined characteristics. Each Card Instance retains its identity and Owner.
3. In regular Magic, a card's name defines its identity; same-named printings share one Card Definition. Separate identities for Un-set or silver-border variants are not required.
4. Card Abilities use structured fields for applicable conditions, modes, targets, variable values, replacement or delayed effects, and the previously agreed kind, rules text, trigger, cost, and effect.
5. Game Objects can have an attachment relationship. Enforcement and detailed visual placement remain manual/deferred.
6. The Match stores a general Object Link from a source Game Object, optionally identifying the relevant Card Ability, to related Game Objects, separate from attachment; it does not execute the linked effect.
7. Use one default Card Printing's characteristics per Card Definition; do not model gameplay characteristic differences across alternate printings.
8. Card Abilities support structured references to relevant card data and Match context, including a Controller's Commander's Color Identity; Color Identity is a Card Definition property distinct from current color.
9. A chosen card name is structured Game Object state that the ongoing Card Ability can reference.
10. A chosen card name does not need to resolve to a Card Definition in the local Card Catalog; a separate Card Name Directory can support suggestions and other name-based uses.
11. The full Card Name Directory is available from the initial release independently of set-level Card Catalog imports.
12. Represent rules-derived abilities through reusable rules data keyed to card characteristics instead of duplicating them on every matching Card Definition. Preserve whether an ability is printed, granted, or rules-derived.

13. Store applicable variable values as generic bindings (for example, X = N) on the relevant Game Object or Ability Game Object. Use existing Object Links for referenced Game Objects instead of introducing a general trigger-event snapshot.
14. Store effects as ordered structured parts that can refer to Game Objects and their characteristics using Comprehensive Rules value timing, including last known information. Effect resolution remains future development work.
15. Store mana symbols and quantities in card and ability costs, plus mana-producing effect data, as ordered typed values alongside rules text.
16. Represent Comprehensive Rules predefined tokens with reusable Token Definitions, separate from Card Definitions. Token-creation effects may refer to a definition and add or modify characteristics; other custom or copied token outcomes use explicit or copy-based descriptors.
17. For a multi-faced card, use its front-face name as the canonical Card Definition and Decklist identity. Store every face's name on its Card Component and index every face name to the same Card Definition in the Card Name Directory. Decklist import requires the canonical front-face name.
18. The Card Name Directory includes canonical card names and every alternate or composite name a card-name-choice effect may legally select under the Comprehensive Rules. Such entries may refer to a Card Definition, Card Component, Alternative Characteristics, or composite form, and do not create additional Decklist identities.
19. Retain a printed keyword ability and link it to separate structured Card Ability records for each ability defined by the Comprehensive Rules. Each linked record carries its own applicable Zone and behavior; mechanics remain unautomated.
20. Store a Saga chapter number on its structured chapter ability. Represent grouped chapter symbols as separate abilities, derive the final chapter number from the greatest number among the Saga's applicable chapter abilities, and use reusable rules data for Saga lore-counter and sacrifice behavior.
21. Store Game Outcome as manual Match state. Track each Match Player as still playing, won, or lost, and the overall Game as ongoing, complete, or a draw; do not evaluate rules or card effects to determine the result.
22. During manual resolution, the controller of a card ability may move a specific known Game Object into another Match Player's private Hand or Library when its cost or effect directs that move. The Zone's other contents stay hidden and owner-managed.
23. Store computed variable sources as declarative Card Ability data describing the source, references and parameters, and Comprehensive Rules timing for determining the value. Retain an applicable determined value as a binding such as X = N on the relevant Game Object or Ability Game Object. This is data, not an executable function call; evaluation and effect behavior are future rules-engine work.
24. Store each double-faced Card Definition's form kind as modal double-faced, nonmodal double-faced, or meld, with structured characteristics for every printed face. Each Match Game Object records its current face, or the combined face for a melded object. Players choose faces when casting or playing modal double-faced cards as lands and record face changes manually; no face legality or transition behavior is automated initially.
25. Triggered Card Ability data explicitly identifies an event trigger or state trigger and stores the corresponding event or game-state condition. Keep this as declarative data; Manual Matches do not evaluate the trigger or its repeat timing.
26. A face-down Game Object retains its underlying Card Instance or source object, face-down source or mode, visible characteristics, applicable turn-up procedures, and viewer permissions. Participant views redact underlying identity as required. Manual Matches store this state while players handle face-down procedures themselves.
27. A Battle Game Object stores its Protector as a Match Player reference distinct from its Owner and Controller. Participants record the designation manually; eligibility and selection rules are not automated initially.
28. A spell Game Object stores a structured Casting Record of applicable choices and payment facts, including a chosen X, selected modes or fused split-card halves, alternative or additional costs, and the colors of mana spent. Card Abilities can refer to relevant facts after casting and, where required by the Comprehensive Rules, after the spell resolves into a permanent. Manual Matches record the data without checking costs or applying effects.
29. Card Ability data describes Opening-Hand Actions with their conditions, choices, costs, and actions. Match setup records which actions participants take after mulligans and before the first turn and the resulting state. Participants perform them manually.
30. Represent an ordered library-card operation as a reusable declarative Library Sequence group in effect data. Record the source Zone, operation, stop predicate, handling of the selected card and remaining cards, their ordering, and no-match behavior. The group is stored in the initial Card Catalog; Manual Matches do not evaluate or execute it.
31. A Casting Record stores the source Zone as well as casting choices and payment facts. Keep the record or a reference to it when the spell resolves into a permanent. A Game Object put onto the Battlefield without being cast has no Casting Record. Card Abilities can reference this information; Manual Matches record it without interpreting it.
32. Preserve relationships among abilities represented together by a Comprehensive Rules construct, their shared conditions, and related characteristic changes. This includes Class level bars, Leveler and Station thresholds, and Case solve/solved structures. Store this declarative structure before automation.
33. Do not provide variant-specific play support for Schemes or Vanguards in the initial version. Generic imported card information may remain, but Scheme Deck lifecycle and Vanguard setup modifiers are out of scope.
34. Store Sticker Sheets and Sticker Definitions separately from card data. Match Players reference available sheets, and Sticker Placements relate definitions to Game Objects with applicable ordering; do not add sticker-specific fields to Card Definition, Card Component, or Card Characteristics.
35. Store applicable Match statuses and designations as validated variants in one Rules State collection. Statuses and designations remain distinct categories; counters remain separate.
36. Keep Card Components for independently meaningful printed parts and use a separate linked **Alternative Characteristics** record for alternate characteristic values. It uses the same characteristic field definitions and declares a composition mode: partial alternatives inherit unspecified values where the Comprehensive Rules say they remain unchanged; full alternatives use only their own values in the stated context. A typed relationship identifies when and how the values apply.
37. Represent a characteristic-defining ability as a structured static Card Ability that declares the characteristics it defines and their value sources. Keep printed stat markers such as `*` and `1+*` in Card Characteristics; do not add reverse references from those fields to the ability's formulas. Counter-based changes, such as Walking Ballista's +1/+1 counters, remain separate ability and Match data.

38. Reuse a typed Zone Change Condition in replacement and triggered Card Ability data. It identifies the affected object, source Zone, destination Zone, and whether the move would occur or has occurred. Keep the replacement action and triggered effect separate; this does not create a Match event history or generic event snapshot.

39. Represent continuous effects as structured, typed changes describing what they do, such as changing an object's types, removing abilities, or setting power and toughness. Do not store a Comprehensive Rules layer or sublayer label on each card-data change; a future rules engine derives the classification from the change's meaning.

40. Keep zone movement and object eligibility as separate data. A typed Zone Change Condition describes the moving object, its source and destination Zones, and whether the move would occur or has occurred. When only a subset of moving objects qualifies, the condition references a reusable Object Filter describing that subset, such as cards versus cards and tokens or an opponent's Graveyard versus any player's Graveyard.

## Questions still open

- Continue checking representative card forms and unusual ability structures through random sampling.

## Interactive random-card sampling

### Sample 1: Command Tower

Command Tower is a Land with an activated mana ability: tap it to add one mana of any color in its Controller's Commander's color identity. The result depends on Match context rather than a fixed color list on the land. Wizards' release notes clarify that a player without a Commander, or with a colorless Commander, gets no mana from this ability. The card remains manually played in the initial release; the sample is checking whether the structured Card Ability model can represent its contextual reference for later automation.

Status: Q28 settled. Card Ability data must support structured references to relevant card data and Match context, including the current Controller's Commander's Color Identity. The initial Manual Match stores this data without executing the ability.

The sample also confirms the need to expose Color Identity as a Card Definition property distinct from the card's current color. The Comprehensive Rules define it from a card's mana symbols, characteristic-defining abilities, and color indicator, with special handling for multiple components and alternative characteristics. [Wizards Comprehensive Rules, rule 903.4](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 2: Pithing Needle

Pithing Needle asks its controller to choose a card name as it enters. While it remains on the Battlefield, activated abilities of sources with that name can't be activated, except for mana abilities. This uses a chosen value that persists as Game Object state and is read by an ongoing ability with a source filter and exception. The restriction also applies to matching cards in any Zone. Wizards documents these interactions in the release notes. [Wizards Innistrad: Midnight Hunt release notes](https://magic.wizards.com/en/news/feature/innistrad-midnight-hunt-release-notes).

Status: Q29, Q30, and Q31 settled. Store the chosen card name as structured state on the relevant Game Object and let the ability reference it. Accept names that are not present in the local Card Catalog; the full Card Name Directory is available from the initial release for suggestions and other name-based features. This does not make an unimported Card Definition eligible for Decklist import. Ability enforcement remains manual in the initial release.

### Sample 3: Spatial Merging

Spatial Merging is a Planechase Phenomenon that results in two Plane cards being active at once. The agreed Game Object and Zone model can hold multiple active Plane objects in the shared Planechase area, so this sample requires no additional card-data field. Players manage their simultaneous effects manually. [Wizards, What Is Planechase?](https://magic.wizards.com/en/news/feature/what-is-planechase-and-why-is-it-awesome).

### Sample 4: Animate Dead

Animate Dead exercises several ability forms on one Card Definition: an Aura restriction, an enters-the-battlefield trigger that returns a creature card and attaches Animate Dead to the resulting Game Object, an ability change tied to that event, a continuous power/toughness modifier, and a leaves-the-battlefield trigger that refers to the returned object. Its triggered abilities are represented by Ability Game Objects on the Stack, separately from Animate Dead's Card Ability data. This sample exercises structured Card Ability data, a one-shot Zone change, a continuous effect, an Attachment, and an Object Link. The card's rules text and structured effect data are present in the initial Card Catalog; the Manual Match does not evaluate or apply them. The Comprehensive Rules define “effect” as a result of a spell or ability and distinguish one-shot, continuous, replacement, and prevention effects. The schema follows those rules distinctions without requiring their mechanics to be implemented up front. [Wizards Comprehensive Rules, sections 113 and 609–615](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Gatherer: Animate Dead](https://gatherer.wizards.com/Pages/Card/Details.aspx?name=Animate%20Dead).

Status: Q32 settled. Store structured ability and applicable effect data in the initial model, using Comprehensive Rules terminology and distinctions. Effect evaluation and application are future development work.

### Sample 5: Dryad Arbor

Dryad Arbor is a green creature land with the Forest subtype, a green color indicator, no mana cost, and no printed rules text. Under Comprehensive Rules rule 305.6, its Forest subtype gives it an intrinsic “{T}: Add {G}” mana ability even though that ability is absent from its text box. The rule applies to the five basic land types—Plains, Island, Swamp, Mountain, and Forest. Other land subtypes do not grant this intrinsic ability by themselves. The card's type line, color indicator, and other characteristics fit the existing Card Characteristics model. [Wizards Comprehensive Rules, rules 204, 205, and 305.6](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Gatherer: Dryad Arbor](https://gatherer.wizards.com/Pages/Card/Details.aspx?name=Dryad%20Arbor).

Status: Q33 settled. Generate abilities supplied by characteristics through reusable rules data, such as a shared mapping from each basic land subtype to its intrinsic mana ability. Preserve the ability's rules-derived origin; do not duplicate that ability on each Card Definition. Manual Matches store the structured ability data without automatically tapping the land or adding mana.

### Sample 6: Chalice of the Void

Chalice of the Void enters with X charge counters and triggers when a player casts a spell whose mana value equals its charge-counter count. Its triggered ability refers to that specific spell and counters it when the ability resolves. The comparison is determined when the spell is cast; later changes to Chalice's counters do not change whether the ability triggers or counters the spell. This exercises an enters-the-battlefield replacement effect, an X value, counter state, a cast-event trigger, a spell's mana value while on the Stack, and a Stack Ability Game Object that retains a reference to the spell that caused it to trigger. The structured model records applicable values as generic bindings such as X = N and uses the existing Object Link for the spell reference; it does not need a bespoke trigger-event snapshot. [Wizards, The Lost Caverns of Ixalan Release Notes](https://magic.wizards.com/en/news/feature/the-lost-caverns-of-ixalan-release-notes), [Wizards Comprehensive Rules, rules 107.3, 202.3, 603.2–603.3, and 614.1](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

Status: Q34 settled. Preserve applicable variable bindings on the relevant Game Object or Ability Game Object, while using the existing Object Link model for referenced Game Objects. Do not add generic event-specific trigger snapshots.

### Sample 7: Swords to Plowshares

Swords to Plowshares exiles a target creature, then its controller gains life equal to that creature's power. Wizards' release notes specify that the power used is the creature's last power on the Battlefield. This exercises ordered effect parts, an Object Link to the affected creature, and a characteristic lookup using the Comprehensive Rules' current-information/last-known-information rules after a Zone change. Structured effect data is required in the Manual version, while applying the instructions remains future work. [Wizards, Bloomburrow Release Notes](https://magic.wizards.com/en/news/feature/bloomburrow-release-notes), [Wizards Comprehensive Rules, rules 400.7 and 608.2h](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

Status: Q35 settled. Store effect instructions in order, with reusable references to relevant Game Objects and the characteristics/value timing required by the Comprehensive Rules, including last known information. Manual Matches store this data; applying the effects is future work.

### Sample 8: Wastes

Wastes is a Basic Land with no land subtype and a printed “{T}: Add {C}” ability. It does not gain that ability from a land-type rule: rule 305.6 grants intrinsic mana abilities only to lands with one of the five basic land types. This confirms that printed and rules-derived abilities use the same Card Ability representation while preserving their different origins. It also exercises the distinction between producing one colorless mana ({C}) and a generic cost ({1}), which can be paid with any type of mana. [Wizards Comprehensive Rules, rules 107.4b–c and 305.6](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Wizards Time Spiral Remastered FAQ](https://media.wizards.com/2021/downloads/TSR_Release_Notes/EN_MTGTSR_FAQ_20210118.pdf).

Status: Q33's printed-versus-rules-derived distinction and Q36 are settled. Costs and mana-producing effect data store mana symbols and quantities as ordered typed values alongside rules text.

### Sample 9: Smothering Tithe

Smothering Tithe triggers separately whenever an opponent draws a card. As each ability resolves, that opponent may pay {2}; if they do not, the Tithe's controller creates a Treasure token. If an opponent draws multiple cards at once, the ability triggers once for each card, and the cards are drawn before the triggered abilities are resolved. This exercises per-event trigger instances, an opponent's optional payment, structured generic mana costs, and an effect that creates a predefined token. The existing trigger, choice, cost, ordered-effect, Ability Game Object, typed-mana, and reusable Token Definition structures cover the card's data. [Wizards, Commander Masters Release Notes](https://magic.wizards.com/en/news/feature/commander-masters-release-notes), [Wizards Comprehensive Rules, rules 111.10a, 603.2c, and 603.5](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

Status: Q37 settled. Reusable Token Definitions supply predefined token characteristics and abilities; effects can add or modify characteristics. Custom or copied token outcomes use explicit or copy-based descriptors.

### Sample 10: Pacifism

Pacifism has the static “Enchant creature” ability, which restricts what the Aura spell can target and what it can enchant. Its other ability creates a continuous restriction on the attached creature, which the structured effect can reference through the Aura's Attachment relationship. Both are stored card data in a Manual Match; the app does not validate legal targeting or enforce the creature's restriction. This sample fits the agreed Card Ability, Effect, and Attachment model without introducing another data requirement. [Wizards Comprehensive Rules, rules 303.4 and 702.5](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Wizards Mystery Booster Release Notes](https://magic.wizards.com/en/news/feature/mystery-booster-release-notes-2019-11-11).

Status: Existing structured ability data represents the Aura restriction and attached-object effect; the manual Attachment relationship links Pacifism to the creature it enchants. No new decision.

### Sample 11: Valki, God of Lies // Tibalt, Cosmic Impostor

Valki and Tibalt are the front and back faces of one modal double-faced card. Each face has its own name and characteristics, but while the card is in a zone other than the Stack or Battlefield it has only its front-face characteristics. Card-name choices can still name either face. The front-face name is the Card Definition and Decklist identity; the Card Name Directory indexes both face names to the same definition. [Wizards Comprehensive Rules, rules 712.3, 712.8, and 712.11b](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Wizards Kaldheim Release Notes](https://magic.wizards.com/en/news/feature/kaldheim-release-notes-2021-01-22).

Status: Q38 settled. Each face has its own name in Card Component data, all face names map to one Card Definition in the Card Name Directory, and Decklist import uses only the canonical front-face name.

### Sample 12: The Mightstone and Weakstone

The Mightstone and Weakstone has a modal enters-the-battlefield ability and forms one half of a specific meld pair with Urza, Lord Protector. When the two cards meld, they become one Game Object with the characteristics and name “Urza, Planeswalker.” The existing mode, meld relationship, two-Card-Instance Game Object, and combined-characteristics structures cover the card. The Comprehensive Rules also allow a player to choose the combined back-face name of a meld pair when an effect asks for a card name; Q39 settled that the Card Name Directory includes such composite forms without creating another Decklist identity. [Wizards Comprehensive Rules, rules 201.4e, 712.5e, and 712.8g](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Wizards The Brothers' War Release Notes](https://magic.wizards.com/en/news/feature/the-brothers-war-release-notes).

Status: Q39 settled. Include every alternate or composite name that card-name-choice effects may legally select under the Comprehensive Rules. Map names to their relevant Card Definition, Card Component, Alternative Characteristics, or composite form where possible; they do not create Decklist identities.

### Sample 13: Faithless Looting

Faithless Looting is a Sorcery with a draw-then-discard effect and the Flashback keyword ability. The Comprehensive Rules define Flashback as two static abilities: one works while the card is in the Graveyard and permits casting it for an alternative cost; the other works on the Stack and exiles it if the flashback cost was paid and it would leave the Stack. This exercises an alternative cost, a zone-specific casting permission, and a conditional replacement effect tied to the paid cost. [Wizards Comprehensive Rules, rule 702.34](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Wizards Innistrad Remastered Release Notes](https://magic.wizards.com/en/news/feature/innistrad-remastered-release-notes).

Status: Q40 settled. Preserve Flashback as the printed keyword and link it to two structured Card Ability records: a Graveyard casting permission with its alternative cost, and a Stack replacement effect conditioned on paying that cost. Each record carries its applicable Zone and behavior. The initial Card Catalog stores this structure without executing it.

### Sample 14: Urza's Saga

Urza's Saga is an Enchantment Land — Saga with three chapter symbols. The first two chapter abilities grant abilities, and the third searches for an artifact card with an actual mana cost of {0} or {1}. The Comprehensive Rules define a chapter symbol as a keyword ability representing a triggered ability; its Roman numeral supplies the lore-counter threshold. Grouped symbols represent separate chapter abilities, and a Saga's final chapter number is the greatest number among its chapter abilities. Sagas also have intrinsic lore-counter behavior and are sacrificed after reaching the final chapter once the final chapter ability has left the Stack. This confirms the need to store chapter numbers on separate structured abilities and derive the final chapter number from the applicable chapter abilities. [Wizards Comprehensive Rules, rules 714.2–714.4](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Wizards Modern Horizons 2 Release Notes](https://magic.wizards.com/en/news/feature/modern-horizons-2-release-notes-2021-06-04).

Status: Q41 settled. Store each chapter number on its structured chapter ability; represent grouped symbols as separate linked abilities and derive the final chapter number from the greatest number among applicable chapter abilities. Reusable rules data represents intrinsic lore-counter and sacrifice behavior. Saga mechanics remain unautomated.

### Sample 15: Maze's End

Maze's End has an activated ability whose cost includes returning Maze's End to its owner's hand. On resolution, it searches for a Gate, puts it onto the Battlefield, and shuffles; then, if its controller controls ten or more Gates with different names, that player wins the game. Wizards clarifies that the condition is checked only as the ability resolves, after the search, even if no Gate was put onto the Battlefield. This exercises an ordered effect with a post-search condition and a game-winning effect. The sample confirms that Game Outcome belongs in the Match state alongside the structured ability and effect data. [Wizards Comprehensive Rules, rules 104.1–104.2](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Wizards Magic: The Gathering Foundations Release Notes](https://magic.wizards.com/en/news/feature/foundations-release-notes).

Status: Q42 settled. Track each Match Player as still playing, won, or lost, and the overall Game as ongoing, complete, or a draw. Participants update the outcome manually; game rules and card effects do not determine it.

### Sample 16: Sensei's Divining Top

Sensei's Divining Top has two activated abilities. One lets its controller look at and reorder the top three cards of that player's Library. The other draws a card, then puts Sensei's Divining Top on top of its owner's Library. Both abilities fit the structured cost and ordered-effect model, and the Library's stored order represents the reordered cards. Wizards' rules article illustrates responding with the second ability while the first is on the Stack. The Comprehensive Rules distinguish the ability's controller from the card's owner and keep Library contents hidden. If another player controls the Top, resolving its second ability sends the known Top card to its owner's private Library; Maze's End can similarly return itself to its owner's private Hand as an activation cost. The current Manual Match permissions reserve private Hand and Library manipulation to their owner, leaving unclear how to perform such a specific effect-directed move while preserving the rest of that Zone's privacy. [Wizards Comprehensive Rules, rules 108.3 and 109.5](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Wizards, The Stack and Its Tricks](https://magic.wizards.com/en/news/feature/stack-and-its-tricks-2017-11-30), [Gatherer: Sensei's Divining Top](https://gatherer.wizards.com/Pages/Card/Details.aspx?name=Sensei%27s%20Divining%20Top).

Status: Q43 settled. The controller of a manually resolved card ability can move a specific known Game Object into another Match Player's private Hand or Library when an explicit cost or effect requires it. Unrelated contents remain hidden and owner-managed.

### Sample 17: Thassa's Oracle

Thassa's Oracle has an enters-the-battlefield triggered ability whose X is the controller's devotion to blue when the ability resolves. It looks at the top X cards of that player's Library, puts up to one on top, and places the rest on the bottom in a random order. It then checks whether X is greater than or equal to the number of cards remaining in the Library and, if so, that player wins the game. Wizards confirms the devotion is evaluated as the ability resolves and that a player with no cards in their Library wins even when devotion is zero. This exercises a variable value derived from current Match state, used both to resolve an ordered effect and evaluate a win condition. Its Card Ability data needs to record the source, references, and rules-defined evaluation timing, then retain the determined value as a binding for the rest of that ability. [Wizards Comprehensive Rules, rules 107.3c, 608.2h, and 700.5](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Wizards Theros Beyond Death Release Notes](https://magic.wizards.com/en/news/feature/theros-beyond-death-release-notes-2020-01-10).

Status: Q44 settled. Store X's source, references, and rules-defined timing as declarative Card Ability data, not a function call. When determined, retain the result as a binding such as X = N on the relevant Game Object or Ability Game Object. The initial version stores this metadata without calculating or applying the ability.

### Sample 18: Riverglide Pathway

Riverglide Pathway // Lavaglide Pathway is a modal double-faced card with two separate Land faces. A player choosing to play it as a land selects a land face before it enters. The selected face supplies the Game Object's characteristics on the Battlefield; outside the Stack and Battlefield, the card normally has only its front-face characteristics. Current Comprehensive Rules also allow modal double-faced permanents to transform when instructed if the other face is a permanent, which applies to Pathway cards because both faces are Lands. This sample confirms the need to distinguish modal double-faced form from other double-faced forms and to retain the selected/current face as Match state. [Wizards Comprehensive Rules, rules 712.3, 712.8a, 712.8f, 712.9, and 712.12](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Wizards Marvel Super Heroes Release Notes](https://magic.wizards.com/en/news/feature/marvel-super-heroes-release-notes), [Wizards Zendikar Rising Card Image Gallery](https://magic.wizards.com/en/news/card-image-gallery/zendikar-rising-variants).

Status: Q45 settled as option A. The catalog records the form kind and every face; Match state records each Game Object's current face or melded composite face. Players record face selections and changes manually in the initial version.

### Sample 19: Garruk Relentless

Garruk Relentless // Garruk, the Veil-Cursed is a nonmodal double-faced planeswalker. Its front face has a state-triggered ability that transforms it when it has two or fewer loyalty counters, as well as two loyalty abilities; its back face has three different loyalty abilities. Transforming does not add or remove loyalty counters, and Garruk's abilities cannot be activated on both faces during the same turn. This exercises the newly recorded current-face state, face-specific abilities, a loyalty cost, counters that persist across a face change, and a state trigger whose condition is that the game state meets a threshold. Store the threshold as the state condition and the trigger's kind as `state`; Manual Matches do not evaluate it or its repeat timing. [Wizards Comprehensive Rules, rules 602, 606, 603.8, and 712.2/712.8](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Wizards Innistrad Remastered Release Notes: Garruk Relentless](https://magic.wizards.com/en/news/feature/innistrad-remastered-release-notes).

Status: Q46 settled as option A. Trigger data explicitly identifies event or state kind and stores its corresponding condition. Comprehensive Rules behavior, including state-trigger repeat timing, remains future rules-engine work.

#Commander 1x1 (MOL)
Oathbreaker
Legacy
Vintage
Duel Commanderules](https://magic.wizards.com/en/news/feature/assassins-creed-release-notes).

Status: Q47 settled as option A. A Face-Down State retains underlying identity, source or mode, face-down characteristics, turn-up procedures, and viewer permissions. Manual Matches record the state without automating its procedures.

### Sample 21: Finale of Devastation

Finale of Devastation uses X chosen as the spell is cast. It searches a Library and/or Graveyard for a creature card with mana value X or less, puts it onto the Battlefield, and shuffles if the Library was searched. At X of 10 or greater, its later effect gives creatures its controller controls +X/+X and haste until end of turn. The chosen binding, ordered search and shuffle, characteristic restriction, conditional continuous effect, and duration fit the existing data model. No new decision. [Wizards War of the Spark Release Notes](https://magic.wizards.com/en/news/feature/war-spark-release-notes-2019-04-19), [Wizards Comprehensive Rules, rules 107.3 and 202.3](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 22: Plains

Plains has the Basic supertype and Plains land subtype, which gives it an intrinsic mana ability under the Comprehensive Rules even though the ability is not printed as rules text. This confirms the reusable rules-derived ability data already agreed for each of the five basic land types. No new decision. [Wizards Comprehensive Rules, rule 305.6](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 23: Necropotence

Necropotence skips its controller's draw step, triggers when that player discards a card to exile it from their Graveyard, and has an activated ability that pays 1 life to exile the top Library card face down. A delayed triggered ability returns that specific card to the ability controller's Hand at the beginning of the next end step. The ability-to-card Object Link preserves which of several face-down exiled cards returns. The source-specific visibility rule also means no player may look at cards exiled face down this way while they remain face down. The face-down data and visibility permissions from Q47, delayed-trigger data, Object Links, and replacement or skip behavior represent these requirements; no new decision. [Wizards Wilds of Eldraine Release Notes](https://magic.wizards.com/en/news/feature/wilds-of-eldraine-release-notes), [Wizards Comprehensive Rules, rules 603.7 and 708](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 24: Invasion of Zendikar

Invasion of Zendikar is a Battle — Siege with defense 3. Its enters-the-battlefield ability searches for up to two basic lands and puts them onto the Battlefield tapped. As the Siege enters, its controller chooses an opponent as its Protector. When defeated, the Siege is exiled and may be cast transformed; its back face, Awakened Skyclave, is a creature with a static ability that makes it a Land on the Battlefield and a mana ability that produces mana of any color. The model records defense, counters, abilities, double-faced form, face state, and the Protector separately from Controller and Owner. [Wizards Comprehensive Rules, rules 310.4, 310.9, and 310.12](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Wizards March of the Machine Release Notes](https://magic.wizards.com/en/news/feature/march-of-the-machine-release-notes).

Status: Q48 settled as option A. Battle Game Objects store a Protector Match Player reference separately from Owner and Controller; participants record it manually without eligibility enforcement.

### Sample 25: Ornithopter

Ornithopter is an Artifact Creature with flying, a zero mana cost, and 0/2 stats. The shared Card Characteristics fields store those printed values; its Card Ability data represents flying using the same keyword structure as haste and trample. No new data requirement. [Gatherer: Ornithopter](https://gatherer.wizards.com/Pages/Card/Details.aspx?name=Ornithopter), [Wizards Comprehensive Rules, rule 702.9](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 26: Counterspell

Counterspell targets a spell Game Object on the Stack and counters it, removing it from the Stack without resolving it. The target filter and one-shot effect data already represent these parts. No new data requirement. [Gatherer: Counterspell](https://gatherer.wizards.com/Pages/Card/Details.aspx?name=Counterspell), [Wizards Comprehensive Rules, rules 115 and 701.6](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 27: Engineered Explosives

Engineered Explosives uses X chosen as it is cast. Sunburst adds charge counters according to the colors of mana spent to cast it, including mana spent on additional or alternative costs. Its activated ability destroys each nonland permanent whose mana value equals the number of charge counters on Engineered Explosives. The new Casting Record stores cast-time choices and actual mana-color payment facts for Sunburst to reference as the spell enters the Battlefield. The counter count and nonland permanent filter fit the existing counter and effect data. [Wizards Ultimate Masters Release Notes: Engineered Explosives](https://magic.wizards.com/en/news/feature/ultimate-masters-release-notes-2018-11-29), [Wizards Comprehensive Rules, rules 601.2, 122, 202, 701.8, and 702.44](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

Status: Q49 settled as option A. A structured Casting Record remains associated with the spell Game Object and is available to abilities when relevant, including as the spell resolves into a permanent.

### Sample 28: Wrath of God

Wrath of God destroys all creatures and says they can't be regenerated as part of that effect. The ordered effect data can express a characteristic filter over all creatures, destruction, and the prohibition on replacing that destruction with regeneration. No new data requirement. [Gatherer: Wrath of God](https://gatherer.wizards.com/Pages/Card/Details.aspx?name=Wrath%20of%20God), [Wizards Comprehensive Rules, rules 701.8 and 701.19](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 29: Lightning Bolt

Lightning Bolt targets any legal target and deals 3 damage to it. Its target data, typed numeric effect value, and one-shot damage effect fit the existing Card Ability model. No new data requirement. [Wizards Mystery Booster Release Notes](https://magic.wizards.com/en/news/feature/mystery-booster-release-notes), [Wizards Comprehensive Rules, rules 115 and 120](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 30: Wear // Tear

Wear // Tear is a split card with Fuse. A player may cast either half, or cast both halves together from their Hand as one fused split spell; the two halves have separate targets, and their instructions resolve left-to-right. The split Card Components hold each half's characteristics and abilities, and the Casting Record retains whether one or both halves were chosen and the combined cost paid. The existing ordered effects and per-ability targets represent the combined spell. No new data requirement. [Wizards Dragon's Maze Mechanics](https://magic.wizards.com/en/news/feature/dragons-maze-mechanics), [Wizards Amonkhet Split Card Rules Changes](https://magic.wizards.com/en/news/announcements/amonkhet-split-card-rules-changes-2017-04-04), [Wizards Comprehensive Rules, rules 708 and 702.102](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 31: Leyline of the Void

Leyline of the Void has a replacement effect that exiles cards that would go to an opponent's Graveyard from anywhere. It also lets a player begin the game with it on the Battlefield if it is in that player's opening hand. The replacement ability fits the existing structured replacement data, but the Match has no explicit representation for pregame actions taken with opening-hand cards after mulligans and before the first turn. [Wizards Time Spiral Remastered Release Notes](https://media.wizards.com/2021/downloads/TSR_Release_Notes/EN_MTGTSR_FAQ_20210118.pdf), [Wizards Comprehensive Rules, rules 103.6 and 614](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

Status: Q50 settled as option A. Store Opening-Hand Action data on Card Abilities and record participant choices and results in Match setup; participants perform the actions manually.

### Sample 32: Worldknit

Worldknit is a Conspiracy whose ability depends on every card in its owner's draft card pool starting the game in their Library or the Command Zone. Per user direction, this card is excluded from common-format model coverage because it is banned in the formats they checked. Do not add a general Card Pool model on the basis of this sample. [Wizards Developing Conspiracy](https://magic.wizards.com/en/news/making-magic/developing-conspiracy-2014-05-20), [Wizards Comprehensive Rules, rules 315.3–315.5 and 903.13e](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

Status: Q51 closed per format scope. Worldknit's Card Pool condition does not create a Match data requirement.

### Sample 33: Battle of Wits

Battle of Wits has an upkeep triggered ability with an intervening-if condition: its controller wins if they have 200 or more cards in their Library. The trigger-condition field, state condition, and manual Game Outcome data cover the sample; Manual Matches do not evaluate the threshold or award the win automatically. [Gatherer: Battle of Wits](https://gatherer.wizards.com/Pages/Card/Details.aspx?name=Battle%20of%20Wits), [Wizards Comprehensive Rules, rules 104.2b and 603.4](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

No new data requirement.

### Sample 34: Esika, God of the Tree // The Prismatic Bridge

Esika // The Prismatic Bridge is a modal double-faced card. Esika has a mana ability and grants other legendary creatures you control vigilance and a mana ability. The Prismatic Bridge has an upkeep trigger that reveals cards from the top of its controller's Library until it finds a creature or planeswalker, puts that card onto the Battlefield, and puts the remaining revealed cards on the bottom in a random order. If there is no match, the whole Library is revealed and randomized. Its card faces, current-face state, granted abilities, trigger, and mana effect fit existing data. The Library Sequence group covers the reveal operation, stopping condition, selected card, remaining cards, and no-match behavior. [Wizards Kaldheim Release Notes](https://magic.wizards.com/en/news/feature/kaldheim-release-notes-2021-01-22), [Wizards Comprehensive Rules, rules 605.1, 701.20, and 712](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

Status: Q52 settled as option A. Represent this as a reusable declarative Library Sequence group in effect data; participants perform its operations manually.

### Sample 35: Black Lotus

Excluded from model-coverage review under Q51: Black Lotus is banned in Commander and restricted to one copy in Vintage. No model requirement is inferred from this sample. [Wizards Banned and Restricted List](https://magic.wizards.com/en/banned-restricted-list).

### Sample 36: Rhystic Study

Rhystic Study triggers whenever an opponent casts a spell. As the trigger resolves, that opponent may pay {1}; its controller decides whether to draw only after the payment decision. The existing event trigger, opponent context, resolution choices, payment data, and ordered effect parts cover this pattern, as with Smothering Tithe. No new data requirement. [Wizards Wilds of Eldraine Release Notes](https://magic.wizards.com/en/news/feature/wilds-of-eldraine-release-notes), [Wizards Comprehensive Rules, rules 603.2 and 603.5](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 37: Phage the Untouchable

Phage has an enters-the-battlefield triggered ability with an intervening-if condition: its controller loses the game if Phage was not cast from their hand. The Casting Record persists when a spell becomes a permanent and now includes the Zone from which it was cast. An object put directly onto the Battlefield has no Casting Record, so the ability can distinguish it from a spell cast from Hand. Manual Matches record the facts and the Game Outcome; they do not evaluate the condition or apply the loss. [Wizards Rules Changes](https://magic.wizards.com/en/news/feature/rules-changes-2009-06-10), [Wizards Comprehensive Rules, rules 104.3a and 603.4](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

Status: Q53 settled as option A. Add the cast source Zone to the Casting Record and retain it with the permanent after resolution; objects put onto the Battlefield without being cast have no Casting Record.

### Sample 38: Phyrexian Fleshgorger

Phyrexian Fleshgorger has its normal artifact-creature characteristics and a prototype set with a different mana cost, color, power, and toughness. The prototype set applies to the spell on the Stack and the permanent it becomes when cast prototyped, then stops applying when that permanent leaves the Battlefield. Its name, types, and abilities otherwise remain shared. This tests a cast-selected characteristic set on one physical card. [The Brothers' War Release Notes](https://magic.wizards.com/en/news/feature/the-brothers-war-release-notes), [Comprehensive Rules, section 718](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 39: Bottomless Pool // Locker Room

This Room has two names and two doors on one card. A spell cast from it uses one chosen door; on the Battlefield, each door has its own unlocked state and the permanent's characteristics combine the doors that are unlocked. A Room entering the Battlefield without being cast starts with both doors locked. This needs two separately addressable door components and per-door Match state, beyond simply recording the current face of a double-faced card. [Duskmourn: House of Horror Release Notes](https://magic.wizards.com/en/news/feature/duskmourn-house-of-horror-release-notes), [Comprehensive Rules, sections 709 and 709.5](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 40: Hunter's Talent

Hunter's Talent is an Enchantment — Class with an initial ability and two level bars. Each bar combines an activated ability that changes the Class's numerical level with a static ability that grants the abilities in its text section at that level or higher. Class level is a rules designation, not a level counter. This tests structured section/level data and a state value separate from ordinary counters. [Bloomburrow Release Notes](https://magic.wizards.com/en/news/feature/bloomburrow-release-notes), [Comprehensive Rules, section 716](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 41: Case of the Filched Falcon

The Case has an ordinary ability, a “To solve” condition checked at the beginning of the controller's end step and again as that ability resolves, and a final ability that functions only after the Case becomes solved. Solved is a designation on the permanent, retained until it leaves the Battlefield. This tests a condition-gated ability plus persistent rules state. [Murders at Karlov Manor Mechanics](https://magic.wizards.com/en/news/feature/murders-at-karlov-manor-mechanics), [Comprehensive Rules, section 719](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 42: You Are Unworthy of Mercy

This non-ongoing Scheme has a “set this scheme in motion” ability and a conditional effect based on its controller's land count. Schemes are nontraditional card objects with abilities that function in the Command Zone, and a non-ongoing Scheme returns face down to the bottom of its Scheme Deck after its abilities finish. This adds no new kind of Card Ability, but it exercises Scheme characteristics and Scheme Deck/Command Zone state. [Duskmourn: House of Horror Release Notes](https://magic.wizards.com/en/news/feature/duskmourn-house-of-horror-release-notes), [Comprehensive Rules, sections 314 and 904](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 43: I Am Untouchable

This Ongoing Scheme remains face up in the Command Zone, has a static ability there, and abandons itself after a triggered ability. Compared with Sample 42, the record tests the Ongoing supertype and a Scheme that persists rather than returning to the deck after its triggered ability. [Duskmourn: House of Horror Release Notes](https://magic.wizards.com/en/news/feature/duskmourn-house-of-horror-release-notes), [Comprehensive Rules, sections 205.4 and 314](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 44: Ral's Vanguard

Ral's Vanguard is a Vanguard card with a deck requirement, a +1 starting/maximum hand-size modifier, a −5 starting-life modifier, and static abilities that function from the Command Zone. A player's selected Vanguard and modifiers affect Match setup. This tests card fields and per-player variant setup beyond ordinary Card Characteristics and abilities. [Mystery Booster Release Notes](https://magic.wizards.com/en/news/feature/mystery-booster-release-notes-2019-11-11), [Comprehensive Rules, sections 313 and 902](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 45: Stiltstrider

Stiltstrider awards ticket counters and can put a sticker on a permanent its owner controls. Stickers are not cards, counters, or tokens: a sticker has a kind and value, belongs to a specific sticker sheet, and can modify the object's characteristics. The Match must identify the stickers available to a player, each sticker placed on an object, and its position/order where relevant. As a card moves among public zones, its sticker and ordering carry over to the new object; stickers are removed when it moves to a hidden zone. [Unfinity Release Notes](https://magic.wizards.com/en/news/feature/unfinity-release-notes-2022-10-07), [Comprehensive Rules, section 123](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 46: Nezumi Graverobber / Nighteyes the Desecrator

This older flip card is one physical card with normal characteristics and an upside-down alternate characteristic set. Its flipped status changes which name, types, rules text, and power/toughness apply only while it is on the Battlefield. It is not a double-faced card; leaving the Battlefield removes its flipped status. This tests alternate characteristics paired with a temporary Game Object designation. [Comprehensive Rules, section 710](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Wizards, “Flip Service”](https://magic.wizards.com/en/news/making-magic/flip-service-2005-01-17).

### Sample 47: Scavenger Regent // Exude Toxin

This Omen card is one physical card with normal Dragon characteristics and an inset Sorcery — Omen spell with a different name, cost, types, and rules text. The card can be cast using either set; the Omen spell uses its full alternative characteristics on the Stack, and if it resolves, the card is shuffled into its owner's Library. This differs from Prototype because the alternative characteristics describe a spell rather than a persistent permanent form. [Tarkir: Dragonstorm Release Notes](https://magic.wizards.com/en/news/feature/tarkir-dragonstorm-release-notes), [Comprehensive Rules, section 720](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 48: Lumen-Class Frigate

This Station card has an activated Station ability, charge-counter thresholds, ability groups tied to each threshold, and a power/toughness box that applies only at a threshold while on the Battlefield. Its threshold sections grant abilities and, at the final threshold, make it an artifact creature. This tests grouped, counter-conditioned abilities and conditional power/toughness data. [Edge of Eternities Release Notes](https://magic.wizards.com/en/news/feature/edge-of-eternities-release-notes), [Comprehensive Rules, section 721](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 49: Studious First-Year

Studious First-Year is a creature card with a separate inset prepare spell, Rampant Growth. The card remains a creature in every Zone; when the permanent becomes prepared, the Match represents a copy of the prepare spell in Exile and links it to the prepared permanent. That copy uses the prepare spell's Alternative Characteristics as its full normal characteristics. Casting the copy makes the permanent unprepared. This tests full alternative values on a created spell object, along with the Prepared designation and an Object Link. [Secrets of Strixhaven Mechanics](https://magic.wizards.com/en/news/feature/secrets-of-strixhaven-mechanics), [Comprehensive Rules, section 722](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 50: Student of Warfare

Student of Warfare is a Leveler card with a level-up activated ability, level-counter ranges, and distinct abilities and power/toughness for each range. Level counters determine its current level; they are distinct from Class level, which is a designation and not a counter. This, together with Sample 48, checks whether the model can group counter-threshold sections and their conditional abilities and stats while keeping Class level separate. [Comprehensive Rules, sections 107.8, 702.87, and 711](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Gatherer: Student of Warfare](https://gatherer.wizards.com/Pages/Card/Details.aspx?name=Student%20of%20Warfare).

## Q52 settled: Library Sequence

Use a reusable declarative Library Sequence group within effect data. Store its source Zone, operation (such as reveal, look, or exile), stop predicate, selected-card handling, remainder handling and order, and no-match behavior. Related patterns such as cascade, discover, and hideaway retain their distinct operations and outcomes. The initial Card Catalog stores the structure; participants perform the operations manually.

Status: Settled as option A.

## Q53 settled: Casting origin

Add the source Zone to each Casting Record and retain the record when the spell resolves into a permanent. A permanent put onto the Battlefield without being cast has no Casting Record. Card Abilities can reference these data; Manual Matches store them without checking conditions.

Status: Settled as option A.

Status: Q54 and Q59 settle the Alternative Characteristics data shape. The chosen composition modes do not require corresponding mechanics or legality checks to be automated in a Manual Match. Q55–Q59 have a recorded direction below.

### Q54 settled: How should alternate characteristics be represented?

The current model uses a **Card Component** for characteristic-bearing parts such as faces and split-card halves. These cards show why a single card may need several characteristic records, but the records do not all play the same role:

- A Room has two halves that can both be unlocked on one permanent. Each half has its own name and rules text, while some characteristics are shared.
- Prototype changes only selected characteristics—mana cost, color, power, and toughness—while the card keeps its other characteristics.
- An Omen or Adventure inset supplies a different set of spell characteristics while that spell is on the Stack.
- A Preparation inset supplies the characteristics for a spell copy in exile; it is not an alternate way to cast the physical card.
- A flip card's alternate name, type line, text, power, and toughness apply to a permanent after it is flipped; it is still one-way state.
The rules distinguish these cases: Room halves are separately unlockable, while Prototype changes only a subset of characteristics; Omen/Adventure and Preparation supply spell/copy characteristics in different contexts. See [Comprehensive Rules §§709.5, 710, 715, 718.5, 720, and 722](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

The benefit of A is broader than code reuse: one kind of record can supply characteristic data to catalog lookup, name indexing, casting choices, copies, and Match state. Its cost is that “component” becomes a broad label, and the relationships must explain whether a record is a face/half, a partial override, an alternate spell, a copy template, or an alternative state of the same permanent. A single record kind does not remove those distinctions; it can only put them in typed relationships and field-composition rules.

- **A. One broad Card Component kind.** Represent each printed panel or alternative characteristic form with the same characteristic data shape and a required, typed relationship that states what it is and how it is used. This keeps references uniform, but needs explicit support for partial values and for whether characteristics replace, combine with, or temporarily describe another object.
- **B. Card Components plus Alternative Characteristics.** Keep Card Components for faces and independently meaningful printed parts such as Room halves. Add a linked Alternative Characteristics record for partial or complete alternate values of one component, including an Adventure spell's alternative characteristics. Both use the same characteristic field definitions. A typed relationship states when the values apply; the composition mode says whether unspecified values carry over.
- **C. A separate schema for every mechanic.** Create Prototype-, Omen-, Preparation-, flip-, and Room-specific data structures. This names every exception directly but duplicates characteristic fields and makes new card forms require new schemas.

**Decision: B, named Alternative Characteristics.** Keep one shared definition of characteristic fields. Use Card Components for faces and independently meaningful printed parts, and a separate linked Alternative Characteristics record for partial or complete alternate values. Its composition mode states whether unspecified values inherit from the linked component where the Comprehensive Rules say they remain unchanged, or are absent from the active full alternative. A typed usage relationship states whether those values apply to an alternate spell, an alternate permanent state, or a created copy.

#### Why “Alternative Characteristics”

The Comprehensive Rules describe these as **alternative characteristics**, including for flip cards, Adventures, Prototype, Omen, and Preparation. Prototype shows a partial alternative: some values change while other characteristics remain the same under rule 718.5. An Adventure spell uses only its alternative characteristics while on the Stack. The composition mode distinguishes these cases; both use the same field model. [Wizards Comprehensive Rules §§710, 715, 718.5, 720, and 722](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

#### Concrete Alternative Characteristics example: Phyrexian Fleshgorger

Phyrexian Fleshgorger is an especially clean example because Prototype changes only some values and explicitly keeps the same abilities and types. Its normal Card Component holds its name, `{7}` mana cost, colorless color, Artifact Creature — Phyrexian Wurm types, 7/5 power/toughness, and abilities (menace, lifelink, ward, and Prototype). The linked Alternative Characteristics record for Prototype stores the changed mana cost `{1}{B}{B}`, black color, and 3/3 power/toughness. The other values come from the Card Component. When the card is cast prototyped, the Casting Record retains that choice; an ability such as ward that asks for the creature's power reads the selected alternative value of 3.

This is why Alternative Characteristics are useful: they store the difference instead of copying the whole card and risking its shared abilities or types drifting out of sync. The [Brothers' War release notes](https://magic.wizards.com/en/news/feature/the-brothers-war-release-notes) give the card's printed characteristics; [Comprehensive Rules §718.5](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf) says the other characteristics remain the same.

#### Contrast: Grizzly Bears

Grizzly Bears needs no Alternative Characteristics record. Its one Card Component contains `{1}{G}`, green, Creature — Bear, and 2/2; its Card Abilities list is empty, and it has no alternative values. This keeps ordinary cards simple. Wizards identifies Grizzly Bears as a true vanilla creature—one with no abilities—in its [Strixhaven release notes](https://magic.wizards.com/en/news/feature/strixhaven-school-of-mages-and-commander-2021-edition-release-notes-2021-04-16).

### Q55 settled: How should a Match record special card states?

The Comprehensive Rules distinguish a permanent's **status** from its **designations**. Flipped/unflipped is one of four status categories, alongside tapped/untapped, face up/face down, and phased in/phased out. A Class level, solved Case, prepared permanent, or unlocked Room half is a designation. A designation is not a counter, though it can carry a value (Class level) or identify a particular half (Room door). These are all Match facts that a Manual Match may need to record without enforcing. See [Comprehensive Rules §§110.5, 709.5, 716.2, 719.3, and 722.3](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

Use **A, refined**: one typed Rules State collection with distinct status and designation variants. For example, `flipped` is a status; `class_level = 2`, `solved`, `prepared`, and `left_half_unlocked` are designations. Each value kind has an allowed shape and applicable-object rules. Counters remain a separate structure. This keeps the top-level Match state stable without allowing arbitrary keys or treating different rules concepts as equivalent.

This scales by adding a validated state variant inside the common structure when a new supported rules state appears, rather than adding another top-level Game Object field. It still requires explicitly modeling each new kind; it does not make unknown states free. The original A was too loose because it called `flipped` a designation and could be read as an arbitrary key/value bag.

Status: Settled as option A, refined to separate Game Object Status from Designation.

### Q56 settled: How should abilities that share a condition be stored?

Your direction is A, with one important terminology refinement: this is not merely a visual text-section record. The Comprehensive Rules define the Leveler and Station symbols as static abilities with counter-based conditions, and a Class level bar as a keyword ability representing both an activated ability and a static ability. A Case's “To solve” text is a triggered ability; “Solved” is a designation that gates its later ability. These rule structures can group abilities and characteristic changes under a shared condition, even though their exact kinds differ. See [Comprehensive Rules §§711, 716, 719, and 721](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

Store the actual Card Ability relationships, costs, shared condition, granted abilities, and characteristic changes as structured data. For a Class bar, retain its activated part, resulting Class level, and static ability grants. For a Leveler or Station threshold, retain the counter condition and the abilities/stat changes that share it. For a Case, retain the triggered “To solve” ability, the `solved` designation, and the ability gated by that designation. The current answer is A; this data is present before automation, but the Match does not evaluate the condition or apply the changes.

Status: Settled as option A, clarified as structured ability relationships and conditions rather than a display-only section.

### Q57 settled: Scheme and Vanguard variant support

Do not add Scheme Deck, Ongoing Scheme, Vanguard selection, or Vanguard setup-modifier support to the initial version. These cards belong to variant play the group does not plan to use. This excludes their variant-specific data requirements; it does not change how ordinary-format cards are modeled. Their samples remain documented as deliberate scope exclusions.

Status: Settled as out of scope.

### Q58 settled: Keep stickers outside the card model

Use A with a strict boundary. Sticker Sheets and Sticker Definitions are their own catalog concepts; Match Players reference the sheets available in their game; Sticker Placements reference a Sticker Definition and the affected Game Object, retaining the ordering needed by the rules. Do not add sticker fields to Card Definition, Card Component, or Card Characteristics. A placement is a separate Match relationship to the Game Object, not a sticker-specific property on the shared card record. Future ability/effect data may refer to sticker operations, while future rules behavior can derive effective characteristics from placements without changing the card's base characteristics. Ticket counters continue to use Counter data. Sticker sheet selection UI and sticker-effect automation remain future work.

This keeps the card catalog independent from a sticker subsystem while still retaining the relationships needed for future sticker support.

Status: Settled as option A, with sticker data and placements modeled separately from card characteristics.

### Sample 51: Bonecrusher Giant // Stomp

Bonecrusher Giant is an Adventurer card: its normal characteristics describe a creature, while its inset Stomp supplies alternative characteristics for an Adventure spell. The Adventure spell uses only those alternative characteristics on the Stack. If it resolves, the physical card is exiled and its controller may later cast it as a creature; if it leaves the Stack without resolving, that later permission is not created. This sample tests whether Alternative Characteristics can hold a full alternate spell form, including its own name, cost, types, and rules text, and whether the Match can record the chosen form and result while participants handle the procedure manually. [Comprehensive Rules §§715.1–715.4](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Throne of Eldraine Release Notes](https://magic.wizards.com/en/news/feature/throne-of-eldraine-release-notes-2019-09-20).

### Sample 52: Shatterskull Smashing // Shatterskull, the Hammer Pass

This modal double-faced card has a Sorcery front face and a Land back face. The player chooses which face to cast or play; the selected face supplies the relevant characteristics, and the back face has its own enters-the-battlefield choice about paying life or entering tapped. This is a face choice between two characteristic records, unlike Prototype's partial characteristic change or the Adventure spell's alternate characteristics. The existing Card Component and current-face model appears to represent its two faces; actions and the life/tapped choice remain manual. [Comprehensive Rules §712](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Zendikar Rising Release Notes](https://magic.wizards.com/en/news/feature/zendikar-rising-release-notes-2020-09-10).

### Q59 settled: Alternative Characteristics have a composition mode

The user chose B. Alternative Characteristics have a composition mode that distinguishes **partial alternatives** from **full alternatives**. A partial alternative supplies changed values and inherits omitted values where the Comprehensive Rules say the linked Card Component remains unchanged, as with Prototype. A full alternative supplies the active characteristics for its stated context; omitted values are absent rather than inherited, as with Adventure and Omen spells on the Stack and the Preparation spell copy. Both use the shared characteristic field model. Shatterskull's two faces remain separate Card Components. The mode is stored data only; participants still perform casting, exile, and face choices manually.

Status: Settled as option B.

### Sample 53: Tarmogoyf

Tarmogoyf's printed power and toughness are `*/1+*`. Its characteristic-defining ability sets power to the number of distinct card types among cards in all graveyards and toughness to that value plus one. The Comprehensive Rules say characteristic-defining abilities can define characteristics normally shown in the stat box and function in all zones. This tests a characteristic value whose source is an ability and whose inputs are Match-wide state; no computed value is required in the Manual Match. [Comprehensive Rules §604.3](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Tarmogoyf release notes](https://magic.wizards.com/en/news/feature/reality-fracture-release-notes).

### Sample 54: Walking Ballista

Walking Ballista is printed as a 0/0. Its `{X}{X}` cost records the chosen X when cast; its enters-the-battlefield ability uses that value to put +1/+1 counters on it. Those counters modify the creature's current power and toughness while the printed base remains 0/0. Its later counter-removal ability is a separate activated ability. This contrasts an ability that defines a characteristic value with abilities that change the Game Object by adding or removing counters. Card data can describe these abilities and references now; participants handle casting, counters, and their effects manually. [Comprehensive Rules §§107.3m and 613.4](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Aether Revolt Card Image Gallery](https://magic.wizards.com/en/news/card-image-gallery/aether-revolt).

### Q60 settled: Characteristic-defining values belong to the Card Ability

This is **not** a choice between storing a Characteristic and storing an Ability. Under the Comprehensive Rules, both power/toughness and abilities are characteristics. Tarmogoyf has a normal static Card Ability—more specifically, a characteristic-defining ability—which supplies the values normally shown in its power/toughness box. Its Card Characteristics still preserve the printed `*` and `1+*` markers. Walking Ballista's printed 0/0 likewise stays in Card Characteristics; its separate ability refers to the cast value of X and adds counters. Q60 concerned only whether the characteristic fields need their own direct reference to the ability's structured value source. [Comprehensive Rules §§109.3, 604.3, and 613.4](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

- **A. Keep the structured relationship on the Card Ability.** Record Tarmogoyf's ability as a static characteristic-defining ability, with structured outputs for power and toughness and their value sources. The characteristic fields preserve the printed markers, while the ability remains the one place that explains how those values are defined. A future rules engine reads the ability data when it needs to determine them. This follows the rules concept directly and avoids another reference on the characteristic fields; a feature starting from a stat must inspect the card's structured abilities. Walking Ballista remains a printed 0/0 with its separate X and counter abilities.
- **B. Add a direct reference from each characteristic to its value source.** Keep Tarmogoyf's formula on its structured static ability, and let its power and toughness fields point to the corresponding value sources there. This makes each stat's source immediately discoverable when code starts from that field, but adds references and integrity rules to maintain. Walking Ballista remains a printed 0/0; it does not get a formula link just because counters later modify its stats.

The distinction is about where a data consumer follows the relationship: from the ability to the characteristics it defines (A), or from each characteristic to the ability's value source (B). Neither choice makes the formula a replacement for the ability.

The user chose **A**. Tarmogoyf's static characteristic-defining Card Ability owns the structured power/toughness formulas and identifies the characteristics it defines. Card Characteristics retain the printed `*` and `1+*` values. No direct references from those characteristic fields back to the ability are required. Walking Ballista retains printed 0/0 characteristics; its X and counter abilities remain separate.

Status: Settled as option A.

### Sample 55: Progenitus

Progenitus has a static ability that replaces an event: if it would be put into a graveyard from anywhere, its owner reveals it and shuffles it into their Library instead. Progenitus never reaches the Graveyard, so a trigger that requires it to be put there does not see that event. This tests a replacement condition on a zone move and the replacement action that follows. [Comprehensive Rules §614.1](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Foundations Release Notes](https://magic.wizards.com/en/news/feature/foundations-release-notes).

### Sample 56: Emrakul, the Aeons Torn

Emrakul has a triggered ability that triggers when it is put into a graveyard from anywhere; when that ability resolves, its owner shuffles their Graveyard into their Library. Unlike Progenitus, Emrakul reaches the Graveyard first, so the zone-change event occurs and the ability triggers afterward. These cards test whether the stored data distinguishes an event that is about to happen and may be replaced from an event that has happened and can cause a trigger. [Comprehensive Rules §§603.6 and 614.1](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Ultimate Masters Release Notes](https://magic.wizards.com/en/news/feature/ultimate-masters-release-notes-2018-11-29).

### Q61 settled: Share typed zone-change conditions

Both cards care about a card going to its owner's Graveyard from any Zone, but they observe different moments. Progenitus's replacement effect watches for a move that would happen and changes it before it occurs. Emrakul's triggered ability watches for the move after it occurs, then performs a separate effect. That timing distinction must remain visible in either model; this question is whether the source/destination/object details should be represented in one reusable condition shape or in the separate replacement and trigger records.

- **A. Keep each ability form self-contained.** Progenitus's replacement data records the would-be Graveyard move and its replacement action. Emrakul's trigger data records the completed move, while its effect records the Library shuffle. The fields can have their own shapes, keeping each ability easy to read in its own rules context and avoiding a new shared concept. The future engine must understand the same Zone names in both forms.
- **B. Reuse a typed Zone Change condition inside both forms.** The shared condition names the affected object, source Zone, destination Zone, and timing—such as “would move” for Progenitus or “has moved” for Emrakul. The replacement action and triggered effect remain separate. This gives every ability the same validated vocabulary for describing Zone moves, at the cost of defining a shared condition type now. It does not create a Match event history or store a generic event snapshot.

➡️ Recommended: **B**. Zone changes are a broad rules concept used by many triggers and replacement effects. A shared condition shape can preserve the important before-versus-after distinction while avoiding duplicate definitions for source and destination Zones.

The user chose **B**. Replacement and triggered Card Abilities share a typed Zone Change Condition describing the affected object, source Zone, destination Zone, and timing (`would move` or `has moved`). The replacement action and triggered effect remain separate. This is catalog rule data, not a generic Match event record or history.

Status: Settled as option B.

### Sample 57: Opalescence

Opalescence's static ability makes other non-Aura enchantments creatures and sets their power and toughness from mana value. The same printed ability therefore produces different kinds of characteristic changes: a type change and a power/toughness-setting change. The Comprehensive Rules apply those in different layers (type in layer 4; setting power/toughness in layer 7b). This checks whether the data model separates the distinct changes an ability produces, even though players apply them as one ability. [Comprehensive Rules §613](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Wizards Reality Fracture release notes](https://magic.wizards.com/en/news/feature/reality-fracture-release-notes), [Wizards Design Files: Urza's Destiny, Part 2](https://magic.wizards.com/en/news/making-magic/design-files-urzas-destiny-part-2).

### Sample 58: Humility

Humility makes creatures lose all abilities and sets them to 1/1. This is another single static ability with distinct characteristic changes: ability removal and power/toughness setting. Those changes apply in different layers (layer 6 and layer 7b). Together, Opalescence and Humility expose why each effect change needs clear meaning before any future rules engine decides how simultaneous continuous effects interact. [Comprehensive Rules §613](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), [Wizards Doctor Who release notes](https://magic.wizards.com/en/news/feature/magic-the-gathering-doctor-who-release-notes), [Wizards Design Files: Urza's Destiny, Part 2](https://magic.wizards.com/en/news/making-magic/design-files-urzas-destiny-part-2).

### Q62 settled: Store typed changes and derive layers later

The Comprehensive Rules organize continuous effects into layers so that changes to the same object are applied in the right order. A layer label is not printed on either card. It classifies what a structured effect change does: for example, Opalescence changes types and sets power/toughness; Humility removes abilities and sets power/toughness. The power/toughness part of each ability belongs in layer 7b, even though each ability has another part in a different layer. The question is where that classification should live in the catalog data.

- **A. Store typed effect changes; derive the layer from their meaning.** Opalescence's ability data contains one change that adds the creature type and another that sets power/toughness from mana value. Humility's contains one change that removes abilities and another that sets power/toughness to 1/1. The future rules engine maps each typed change to its Comprehensive Rules layer. This keeps card data focused on what the effect does and gives the rules engine one central place to classify it. It requires the effect-change vocabulary to be precise enough for that mapping; vague free-text effect records would not be sufficient.
- **B. Store an explicit layer label on every effect change.** The same four changes also carry layer labels: type change = layer 4; ability removal = layer 6; power/toughness setting = layer 7b. That makes each change's rules classification visible in the card record and can help inspect catalog data before automation. It also duplicates a classification that follows from the change's meaning, so catalog entries must be reviewed and kept aligned with the Comprehensive Rules. An ability with changes in several layers must be split into separately labeled records either way. Timestamps and dependency ordering still come from the Match and rules engine.

➡️ Recommended: **A**. Store each characteristic change as a typed operation with its target and value source. The operation says what the card does; layer order is the Comprehensive Rules' way of applying such operations. Deriving the layer centrally avoids a card record that says “set power/toughness” while accidentally carrying the wrong layer label. The data still exposes all the parts the future rules engine needs; it just avoids storing the same fact twice.

The user chose **A**. Each continuous effect is represented by precise, typed changes with its target and value source. Card data does not duplicate the Comprehensive Rules layer or sublayer label. A future rules engine classifies each change from its semantics and applies the rules for layers; no layer calculation or effect application is needed in the Manual Match.

Status: Settled as option A.

### Sample 59: Leyline of the Void

Leyline of the Void replaces a move that would put a card into an opponent's Graveyard from anywhere with exile instead. It filters by object kind (a card) and whose Graveyard would receive it (an opponent's). Its opening-hand action is a separate setup action. This checks whether the shared Zone Change Condition can express the scope of a replacement effect as well as the source Zone, destination Zone, and timing. [Wizards Wilds of Eldraine Release Notes](https://magic.wizards.com/en/news/feature/wilds-of-eldraine-release-notes).

### Sample 60: Rest in Peace

Rest in Peace has two different abilities: an enters-the-battlefield ability that exiles the cards already in all Graveyards, and a static replacement effect that exiles any card or token that would go to a Graveyard from anywhere. Compared with Leyline of the Void, it applies to tokens and to every player's Graveyard. This tests whether an ability condition can separately express the Zone-change event and filters on which moving objects or destination owners qualify. [Wizards Outlaws of Thunder Junction Release Notes](https://magic.wizards.com/en/news/feature/outlaws-of-thunder-junction-release-notes).

### Q63 settled: Keep object filters separate from zone changes

Q61 settled on one shared Zone Change Condition for replacement effects and zone-change triggers. These cards show that the move's source and destination are only part of the condition: Leyline of the Void affects cards going to an opponent's Graveyard, while Rest in Peace affects cards and tokens going to any Graveyard. Should those scope details be fields on the Zone Change Condition, or should the condition describe the move while a separate reusable object filter says what kind of object or whose Zone qualifies?

- **A. Keep the full scope in the Zone Change Condition.** Add typed fields for the moving object's kind (such as card or token) and relevant player relationship (such as this ability's controller, that player's opponent, or any player). Leyline's condition says “card, opponent's Graveyard, would move”; Rest in Peace says “card or token, any Graveyard, would move.” This keeps each zone-change condition self-contained and straightforward to read. The condition type will need carefully chosen scope fields as more kinds of zone-change rules are sampled.
- **B. Keep the move and object filter as separate reusable pieces.** The Zone Change Condition records the move (object, source Zone, destination Zone, and would-move/has-moved timing); a separate typed object filter records card versus token and the relevant owner/controller relationship. Both abilities compose the same move structure with different filters. This keeps zone movement distinct from object eligibility and allows the filters to be reused by other kinds of abilities, but requires links between the event condition and its filter data.

➡️ Recommended: **B**. The move is the event being observed; card/token kind and whose Graveyard is involved determine which objects qualify. Keeping those concepts separate supports reusing object filters in other triggers and effects, while the typed fields still make each card's condition complete and inspectable.

The user chose **B**. Zone Change Conditions describe the moving object and its source/destination Zones and timing. A separate reusable Object Filter describes which possible moving objects qualify, including object kind and owner/controller or Zone-player relationships. This separates the observed move from the criteria applied to it and allows filters to be reused in other abilities.

Status: Settled as option B.

### Sample 61: Snapcaster Mage

Snapcaster Mage's enters-the-battlefield ability targets an instant or sorcery card in its controller's Graveyard and grants it Flashback until end of turn, with a cost equal to that card's mana cost. The grant has a fixed duration and can continue to apply if Snapcaster Mage leaves the Battlefield; if the card is cast, the Comprehensive Rules preserve this kind of casting permission as it moves to the Stack. This tests how a temporary ability grant is represented on a different Game Object and how it can survive a Zone change. [Modern Masters 2017 Release Notes](https://magic.wizards.com/en/news/feature/modern-masters-2017-edition-release-notes-2017-03-03), [Comprehensive Rules §§400.7g and 611](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Sample 62: Sword of Fire and Ice

Sword of Fire and Ice continuously gives the equipped creature +2/+2 and protection from red and from blue while the Equipment remains attached. It also has a separate triggered ability when the equipped creature deals combat damage to a player. Unlike Snapcaster Mage's timed grant, this grant applies while an Attachment relationship exists. These two cards test whether the model distinguishes temporary and relationship-dependent ability grants without changing the recipient's printed Card Characteristics. [Wizards Bloomburrow Release Notes](https://magic.wizards.com/en/news/feature/bloomburrow-release-notes), [Comprehensive Rules §611](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf).

### Q64: Where should active granted abilities live?

Both cards give an ability to another object. Snapcaster Mage's Flashback grant lasts until end of turn and may continue when the targeted card moves from the Graveyard to the Stack. Sword of Fire and Ice grants power/toughness and protection only while the Equipment remains attached. The target's printed characteristics should stay intact in either model. The choice is where Match state records the active grant and its duration or applicability.

- **A. Record a Granted Ability entry on the recipient Game Object.** The entry contains the granted ability, its source, and the end time or condition that removes it. Snapcaster Mage creates an entry that expires at end of turn; Sword of Fire and Ice creates entries that remain while it is attached. This makes a recipient's current granted abilities easy to inspect, but Match state must add and remove entries as their durations or conditions change.
- **B. Record an active Continuous Effect separately from the recipient.** The effect links its source Card Ability to the affected Game Object or Object Filter, carries the typed change (grant this ability, or modify power/toughness), and states its duration or applicability condition. Snapcaster Mage's effect lasts until end of turn even if its source leaves; Sword of Fire and Ice's applies while the attachment relation holds. The recipient's effective abilities can later be derived from its printed abilities plus applicable effects. This keeps the effect that grants an ability as the source of truth, but makes the current ability list something a future rules engine must derive.

➡️ Recommended: **B**. The grant, source, target, and expiration/attachment condition are already one continuous effect relationship. Storing a second copy directly on the recipient would need to stay synchronized with that effect. A separate active effect record also matches the typed-change structure settled in Q62 and leaves Card Characteristics unchanged.

Status: Open.
