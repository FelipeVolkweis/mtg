# Magic Tabletop

Shared language for a multiplayer Magic tabletop game in which players manipulate cards and the rules are initially handled manually.

## Language

**Room**:
An invitation-only online session in which two to four guest players can play successive matches together.

**Guest player**:
A person playing in a room under a chosen name, without a persistent account.

**Room Participant**:
A guest player's identity within a room, retained across successive matches. A participant who joins after a Match starts waits for the next Match rather than entering the active one. If the browser credential is unavailable, the participant reclaims this identity by providing their unique Room name while holding the Room's invitation link.

**Match**:
One game of Magic played by the participants in a room.

**Match Player**:
A room participant's role in one match, including their seat and match-specific state.

**Life Total**:
A Match Player's current life value. A Match sets a configurable starting value, and participants can adjust it manually during a Manual Match.

**Turn State**:
The manually tracked active Match Player, turn number, current phase, and current step. It is shared Match state but does not restrict actions in a Manual Match.

**Turn Order**:
The order in which Match Players take turns. For a Manual Match, participants choose the starting player by rolling dice; the default order proceeds clockwise.
_Rules reference_: [Wizards Comprehensive Rules](https://magic.wizards.com/en/rules), section 103.1.

**Priority**:
The rules concept that determines which player may act next. Manual Matches do not formally track Priority or pass sequences; participants coordinate Stack resolution themselves. The Match model should leave room to add explicit Priority and passes when rules automation is introduced.

**Counter**:
A marker associated with a Game Object or Match Player. Counter kinds include numeric/stat counters such as +1/+1 and -1/-1, and category counters such as flying. Numeric values have no fixed digit limit. Counter effects remain manual initially.

**Game Object Status**:
One of the rules-defined physical-state categories of a permanent: tapped or untapped, flipped or unflipped, face up or face down, and phased in or phased out. A status is not a Card Characteristic or a Counter, though it may affect characteristics.
_Rules reference_: [Wizards Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), rule 110.5.

**Designation**:
A rules-defined marker or value that other rules and abilities can identify, such as a Case being solved, a permanent being prepared, a Class level, or a Room half being unlocked. A Designation is distinct from a Counter and from a Game Object Status.
_Rules reference_: [Wizards Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), rules 709.5, 716.2, 719.3, and 722.3.

**Manual Match**:
A match where players perform card actions and resolve card effects themselves, while the game tracks basic table actions.

**Rules-Automated Match**:
A match where the game enforces modeled rules for a supported pool of cards.

**Game state**:
The current players, Card Instances, Game Objects, Zones, Life Totals, manually tracked Turn State, and Game Outcome in a match, including information each player may see.

**Game Outcome**:
Manually tracked Match state recording each Match Player as still playing, won, or lost, and the overall Game as ongoing, complete, or a draw. Participants update this state themselves; the game does not evaluate rules or card effects to determine an outcome.

**Card Catalog**:
The locally stored collection of card definitions and printings available to the game, represented in a game-specific structured model rather than as a direct copy of the import source's schema.

**Card Name Directory**:
The full index of rules-recognized card names, available independently of per-set Card Definition and printing imports from the initial release. It includes canonical names and alternate or composite names that Comprehensive Rules allow a card-name choice to select, such as back-face, Adventure, and melded names. Entries may refer to a Card Definition, Card Component, Alternative Characteristics, or composite form. A name in the directory does not by itself make that card available for Decklist import.

**Card Definition**:
The rules identity and shared characteristics of a card, identified by its canonical name in regular Magic and independent of edition or artwork. For a multi-faced card, the front-face name is canonical for the Card Definition and Decklist entry; each Card Component retains its face name. Record a double-faced card's form kind as modal double-faced, nonmodal double-faced, or meld. A meld pair may also refer to its composite form. Printings of the same named card share one Card Definition. A Card Definition also carries the card's Color Identity.

**Characteristic**:
A rules-defined property of a Magic object, including its name, mana cost, color, types, rules text, abilities, power, and toughness. Both an ability and a value that the ability defines are characteristics of that object.
_Rules reference_: [Wizards Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), rule 109.3.

**Copiable Values**:
The Comprehensive Rules term for the characteristic values a copy effect uses from an object. Match data stores the captured values, including any copy exceptions, in an immutable record using the Card Characteristics field model. A copied Game Object references this record; it does not continue reading from the original object, and later changes to the original do not update the record. Each Game Object keeps its own counters, status, attachments, and other Match state separately. Manual Matches store the record without evaluating copy effects.
_Rules reference_: [Wizards Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), rules 707.2–707.3 and 707.9.

**Card Characteristics**:
The complete set of characteristic data for a Card Component or Alternative Characteristics record, including its name, mana cost, colors, types, rules text, abilities, and stats. Every card form has Card Characteristics; Alternative Characteristics are a separate record for a context-specific alternate form or set of values.

**Color Identity**:
The rules-defined set of colors associated with a Card Definition, distinct from its current color. It is available as card data for format rules and for Card Abilities that reference it.
_Rules reference_: [Wizards Comprehensive Rules](https://magic.wizards.com/en/rules), section 903.4.

**Card Ability**:
An ability represented in a Card Component's characteristics, granted to a Game Object, or derived from characteristics by a Comprehensive Rules rule. Abilities share a structured representation with a kind and rules text, plus applicable details such as a trigger, condition, cost, mode, target, variable value and its declarative source data, replacement behavior, delayed triggered ability, effect, or reference to relevant card data and Match context. Triggered abilities identify whether the trigger is an event or a game state, and store the corresponding event or state condition as data. Mana symbols and quantities in ability costs and mana-producing effects use ordered typed data. Ability origin is retained. Rule-derived abilities use reusable rules data rather than being duplicated on every matching Card Definition. Keyword abilities such as flying, haste, and trample use the same representation. When one printed keyword represents multiple Comprehensive Rules abilities, retain the printed keyword and link it to a separate structured Card Ability record for each rules-defined ability, including each ability's applicable Zone and behavior. Preserve relationships among abilities represented together by a Comprehensive Rules construct, including shared conditions and related characteristic changes such as Class level bars, Leveler thresholds, Station thresholds, and a Case’s solved ability. For Saga chapter abilities, store the chapter number on each structured ability and derive the final chapter number from the greatest number among the Saga's applicable chapter abilities. An activated or triggered ability on the Stack is represented separately as a Game Object. Storing ability and effect data does not mean the effect is automated.

**Characteristic-Defining Ability**:
A static Card Ability that defines a characteristic normally shown elsewhere on its card, such as Tarmogoyf's power and toughness. It remains an ability while defining those characteristics, and functions in all zones under the Comprehensive Rules.
_Rules reference_: [Wizards Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), rule 604.3.

**Casting Record**:
Structured Match data associated with a spell Game Object that records the Zone from which the card was cast, casting choices, and payment facts its abilities or the Comprehensive Rules may need later. Applicable data includes a chosen value such as X, selected modes or fused split-card halves, alternative or additional costs, and the colors of mana actually spent. Card Abilities refer to the relevant recorded facts. Preserve or link the record when a spell resolves into a permanent or another Game Object needs that casting information. An object put onto the Battlefield without being cast has no Casting Record. Manual Matches record the data without validating costs or applying effects.

**Opening-Hand Action**:
A card-specific action taken with a card in an opening hand after mulligans and before the first turn, as allowed by the Comprehensive Rules. Card Ability data describes its applicable conditions, choices, costs, and action. Match setup records whether the action was taken and its result. Participants perform and record these actions manually in a Manual Match.

**Variable Value Source**:
Declarative Card Ability data describing how a variable value is determined, including its source, references and parameters, and the Comprehensive Rules timing at which it is determined. For example, an ability may define X from its controller's devotion to blue when that ability resolves. Store this description as data, not an executable function call. When a value is determined in a Match, retain its binding, such as X = N, on the relevant Game Object or Ability Game Object for use by the ability's effects and conditions. Manual Matches store the source data and any recorded binding without calculating or applying the ability.

**Effect**:
Something that happens in the game as a result of a spell or ability, following the Comprehensive Rules meaning. The rules distinguish forms including one-shot, continuous, replacement, and prevention effects; an effect may also create a delayed triggered ability. Effect data consists of ordered structured parts that can reference Game Objects and characteristics, including their current or last known information as determined by the Comprehensive Rules. Continuous effects identify their individual typed changes, such as changing types, removing abilities, or setting power and toughness. Card data does not duplicate Comprehensive Rules layer or sublayer labels; a future rules engine classifies each change from its meaning. Effects can include reusable data groups such as a Library Sequence. Manual Matches store this structure while participants perform its actions; evaluation and application remain future rules-engine work.
_Rules reference_: [Wizards Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), sections 609–615.

**Library Sequence**:
A reusable declarative effect group for inspecting successive cards from a Library. It records the source Zone, operation, stop predicate, handling of the selected card and remaining cards, their ordering, and no-match behavior. Related card operations such as reveal, look, and exile remain distinct data values. Manual Matches store the structure while participants perform the operations.

**Card Component**:
A characteristic-bearing part of a Card Definition, including its name. A card has one component for a single-faced form and multiple components for forms such as double-faced, split, and Room cards. Each printed face of a double-faced card has its own component with its full Card Characteristics. A melded composite form is represented in addition to the components for its two source cards. An Adventurer card's normal characteristics use a Card Component; its inset Adventure spell is represented by Alternative Characteristics. Component relationships describe the card form without implying that its mechanics are automated.

**Alternative Characteristics**:
Context-specific characteristic values linked to a Card Component, using the same characteristic field model. Each record declares a composition mode. Partial alternatives supply values that differ and inherit omitted values from the linked Card Component where the Comprehensive Rules say they remain unchanged, as with Prototype. Full alternatives supply the characteristics used in the stated context; omitted values are absent rather than inherited, as with Adventure and Omen spells on the Stack or the characteristics of a Preparation spell copy. A typed relationship describes when and how the alternative values apply. Printed faces such as the faces of a modal double-faced card, and independently playable Room halves, remain Card Components.
_Rules reference_: [Wizards Comprehensive Rules](https://media.wizards.com/2026/downloads/MagicCompRules%2020260925.pdf), sections 710, 715, 718, 720, and 722.

**Card Printing**:
A specific printing of a Card Definition from a set, with its own collector number and artwork. Printings of the same named card share one Card Definition. One default Card Printing supplies the stored characteristics for that definition; alternate printing-specific gameplay differences are not modeled.

**Token Definition**:
A reusable characteristic template for a predefined token defined by the Comprehensive Rules, separate from a Card Definition. A token-creation effect may reference this template and add or modify characteristics. Other custom or copied token outcomes can use explicit or copy-based descriptors. Each created token is a Game Object without a Card Instance.

**Card Instance**:
One specific copy of a Card Printing created from a Deck Entry when a Match starts. It retains its identity and owner as it moves between Zones.

**Game Object**:
An entity tracked in a Match, such as a card, token, ability, emblem, or nontraditional card object, with its current Zone, controller, and game state. A Game Object may represent one or multiple Card Instances, as with a melded permanent, or exist without a Card Instance. Its state may include its Game Object Status, Designations, current face or melded composite form, a Face-Down State, a Casting Record, chosen values that abilities refer to such as a chosen card name or a variable binding like X = N, and links to other Game Objects including attachments. A Battle Game Object also records its Protector Match Player, separately from its Controller and Owner. Players record face choices and changes manually in a Manual Match.

**Object Filter**:
A reusable declarative criterion describing which possible Game Objects qualify for a Card Ability condition, event, target, or effect. Typed criteria may refer to object kind, characteristics, or relationships to Match Players and Zones—for example, a card rather than a token, or a Game Object in an opponent's Graveyard. The filter says which objects qualify; it does not specify when their characteristics are inspected. The trigger, target, condition, or effect that uses the filter carries any required timing, such as immediately before a Zone change or by last known information.

**Granted Ability**:
A Card Ability that a rules effect gives to a Game Object, rather than one printed on that object's Card Definition or Card Component. An active grant is represented by a separate Continuous Effect linked to the source Card Ability and recipient, with its typed change and duration or applicability condition. Static grants retain their source ability and applicable Match relationship, such as an Attachment; resolving grants are retained as Match effect data for their duration. A grant does not change the recipient's printed Card Characteristics.

**Sticker Sheet**:
A game aid containing a set of Sticker Definitions. A Match Player's access to stickers is limited to the Sticker Sheets selected for that game.

**Sticker Definition**:
One sticker on a Sticker Sheet, with its rules-relevant kind and value, such as a name, ability, art, or power/toughness sticker. It is catalog data separate from Card Definition and Card Characteristics.

**Sticker Placement**:
A Match relationship between a Sticker Definition and a Game Object. It retains the identity and ordering of a sticker placed on that object without adding sticker-specific fields to the card's base characteristics.

**Face-Down State**:
Match data for a Game Object that is face down. It retains the underlying Card Instance or other source object when applicable, the face-down source or mode, the characteristics shown while face down, applicable procedures for turning it face up, and who may inspect its underlying identity. Participant-specific views redact information from players who are not allowed to see it. Manual Matches store and expose this data according to its visibility rules without automatically applying face-down procedures.

**Ability Game Object**:
A Game Object representing an activated or triggered ability on the Stack. It is distinct from the Card Ability data on its source and has no Card Instance of its own. It may retain references to the source Game Object and Card Ability, applicable variable bindings, and Object Links to relevant Game Objects.

**Owner**:
The Match Player whose deck supplied a Card Instance. Ownership remains with that player when control changes.

**Controller**:
The Match Player currently controlling a Game Object. The controller may differ from the Card Instance's owner.

**Protector**:
The Match Player chosen as protector for a Battle Game Object under the Comprehensive Rules. Protector is Match state distinct from the Battle's Owner and Controller. Manual Matches record which player is the Protector without enforcing which players are eligible to be chosen.

**Zone**:
A game location that holds Game Objects; its kind determines visibility, order, and behavior. A Match may use ordinary Zones, special Zones, and supplementary decks needed to represent its card types and variant components. Visibility normally follows the Zone kind but can vary for individual objects. A manual card cost or effect may direct a participant to move a specific known Game Object into another player's private Zone without exposing the other contents.
_Modeling direction_: Prefer specialized Zone types built on a common Zone base class. Define their required behavior before settling the implementation.
_Rules reference_: [Wizards Comprehensive Rules](https://magic.wizards.com/en/rules), section 400.

**Zone Change Condition**:
A Card Ability condition describing a Game Object moving between Zones. It identifies the moving object, source and destination Zones, and whether the move would occur (for a replacement effect) or has occurred (for a zone-change trigger). When only a subset of possible moving objects qualifies, it references a separate Object Filter. The replacement action or triggered effect is separate.

**Library**:
A player's ordered, hidden Zone created from their Decklist. Opponents can see its size but not its contents or order.
_Avoid_: Deck (for the in-game zone)

**Hand**:
The hidden Zone containing cards a player has drawn. Opponents can see its size but not its contents.

**Battlefield**:
The shared play area containing cards in play, visible to all participants.

**Battlefield Layout**:
The shared visual arrangement of cards on the Battlefield, stored separately from gameplay state so the layout can change without changing rules behavior.

**Graveyard**:
A player's public Zone for cards put there by game actions, including discards and cards that leave the Battlefield. Its order is preserved.

**Exile**:
A public zone for cards removed from the match by an effect.

**Command Zone**:
A public zone for commanders and other special game objects.

**Stack**:
A shared, public, ordered Zone containing spells and abilities waiting to resolve. An ability may be on the Stack without a Card Instance. Manual Matches do not track Priority or pass sequences; participants coordinate resolution themselves. The model should support explicit Priority and pass sequences later.

**Tapped**:
A Game Object state indicating that a permanent is tapped; players can tap and untap permanents manually.

**Decklist**:
A private, reusable list owned by a room participant, containing card quantities and optional exact printings.

**Deck Entry**:
One card and quantity in a decklist, optionally identifying a specific printing.

**Supplementary Deck**:
A collection used by a game variant for cards outside the player's ordinary Library, such as an Attraction deck or planar deck.

**Meld**:
A relationship between two Card Definitions whose Card Instances can combine into one Game Object with combined characteristics. Each Card Instance retains its own identity and Owner.

**Attachment**:
A relationship in which one Game Object, such as an Aura or Equipment, is attached to another Game Object.

**Object Link**:
A relationship from a source Game Object, optionally identifying the Card Ability involved, to one or more related Game Objects, such as the specific object an ability exiles and later refers to. An Object Link is distinct from an Attachment and does not itself perform game actions.
