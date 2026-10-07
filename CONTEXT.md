# Magic Tabletop

Shared language for an invitation-only Magic tabletop where Room Participants play rules-enforced Commander Matches using a supported Card Catalog.

## Language

### Rooms and Matches

**Room**:
An invitation-only online session for guest players and successive Matches. A Room can hold waiting guests while one human plays Solo Practice or two humans play a Commander Match.

**Guest player**:
A person playing in a room under a chosen name, without a persistent account.

**Room Participant**:
A Guest player's identity within a Room, retained across successive Matches. Participants outside the active Match are spectators waiting for a later Match.

**Match**:
One game of Magic played by one or more Match Players in a Room.

**Commander Match**:
A Match using the Commander format, with a designated Commander and Decklists constrained by that Commander's Color Identity.

**Rules-Automated Match**:
A Match where the game enforces modeled rules and authored behavior for a supported pool of cards.

**Manual Match**:
A retired legacy Match whose gameplay was manipulated directly by participants. A stored one ends when its Room loads, and the Room returns to its lobby.

**Solo Practice**:
A practice mode with one human Match Player and an inert Practice Opponent using a mirror Decklist.

**Solo Match**:
A Match played in Solo Practice.

**Match Player**:
A seat in a Match with its own game state, occupied by a Room Participant or a Practice Opponent.

**Practice Opponent**:
An inert Match Player in Solo Practice with its own Library, Hand, Commander, and Life Total. It passes Priority automatically; the human handles its required choices.

**Decklist**:
A private, reusable list owned by a room participant, containing card quantities and optional exact printings.

**Deck Entry**:
One card and quantity in a decklist, optionally identifying a specific printing.

### Match state

**Game state**:
The current players, Card Instances, Game Objects, Zones, Life Totals, Turn State, and Game Outcome in a match, including information each player may see.

**Game Outcome**:
The rules-determined state of each Match Player as playing, won, or lost, and of the Match as ongoing, complete, or a draw.

**Life Total**:
A Match Player's current life value, changed by costs, damage, and effects. Commander Matches start at 40 life.

**Mulligan Count**:
The number of mulligans a Match Player has taken in the current Match.

**Turn State**:
The active Match Player, turn number, phase, and step that determine legal actions and turn procedures.

**Turn Order**:
The order in which Match Players take turns, beginning with the selected or randomly chosen starting player.

**Priority**:
The opportunity for a Match Player to take a legal action or explicitly pass. Consecutive passes resolve the top Stack object or advance the turn procedure.

**Counter**:
A marker on a Game Object or Match Player, such as a +1/+1 counter or a flying counter. A Counter is distinct from a Game Object Status or Designation.

**Game Object Status**:
A permanent's tapped/untapped, flipped/unflipped, face-up/face-down, or phased-in/phased-out state. Status is distinct from Characteristics and Counters.

**Designation**:
A rules-defined marker or value, such as monarch, a solved Case, or an unlocked Room half. A Designation is distinct from a Counter or Game Object Status.

**Commander**:
A designated Card Instance whose designation persists across Zones. Casts from the Command Zone accrue commander tax, and combat damage from the same commander can cause a Commander-specific loss.

**Monarch**:
The Match Player holding the monarch designation, with its associated end-step draw and combat-damage transfer abilities.

### Cards and characteristics

**Card Catalog**:
The locally stored collection of card definitions and printings available to the game, represented in a game-specific structured model rather than as a direct copy of the import source's schema.

**Card Name Directory**:
The index of rules-recognized card names, including alternate and composite names. Inclusion does not imply that a Card Definition is imported or eligible for a Decklist.

**Card Definition**:
A card's rules identity and shared characteristics, independent of edition or artwork and associated with a stable Oracle identity across printings. Its canonical name is its Decklist label.

**Card Printing**:
A set-specific edition of a Card Definition, with its own collector number and artwork. A Deck Entry may request an exact printing or use the default printing.

**Card Component**:
A characteristic-bearing part of a Card Definition, such as a printed face or independently playable half. An Adventure spell uses Alternative Characteristics rather than a separate printed face.

**Alternative Characteristics**:
Context-specific characteristics linked to a Card Component. Partial alternatives inherit unchanged values; full alternatives supply the complete characteristics for their context.

**Characteristic**:
A rules-defined property of a Magic object, including its name, mana cost, color, types, rules text, abilities, power, and toughness. Both an ability and a value that the ability defines are characteristics of that object.

**Card Characteristics**:
The characteristic data belonging to a Card Component or Alternative Characteristics, including name, mana cost, colors, types, rules text, abilities, and stats.

**Oracle Text**:
The current official wording of a card used to determine how it plays, regardless of wording printed on a particular Card Printing. It is distinct from the structured Card Ability data used to represent that behavior.

**Color Identity**:
The rules-defined set of colors associated with a Card Definition, distinct from its current color. It is available as card data for format rules and for Card Abilities that reference it.

**Card Ability**:
An ability belonging to a card's characteristics, granted to a Game Object, or derived from the rules. It is distinct from an Ability Game Object on the Stack.

**Characteristic-Defining Ability**:
A static Card Ability that defines a characteristic normally shown elsewhere on its card, such as Tarmogoyf's power and toughness. It remains an ability while defining those characteristics, and functions in all zones under the Comprehensive Rules.

**Granted Ability**:
A Card Ability given to a Game Object by an effect rather than belonging to its printed characteristics.

**Token Definition**:
A reusable characteristic template for a predefined token. A token is a Game Object without a Card Instance.

**Copiable Values**:
The characteristic values used by a copy effect, including applicable copy exceptions. They are distinct from the copied object's own Counters, status, Attachments, and other game state.

### Objects and effects

**Card Instance**:
One specific copy of a Card Printing created from a Deck Entry when a Match starts. It retains its identity and owner as it moves between Zones.

**Game Object**:
An entity in a Match, such as a card, token, spell, ability, or emblem, with its current Zone and game state. It can represent one or multiple Card Instances, or exist without one.

**Ability Game Object**:
An activated or triggered ability on the Stack, distinct from the Card Ability on its source. It has no Card Instance of its own.

**Owner**:
The Match Player who owns a Card Instance or Game Object under the rules. Ownership remains unchanged when control changes.

**Controller**:
The Match Player currently controlling a Game Object. The controller may differ from the Card Instance's owner.

**Protector**:
The Match Player designated to protect a Battle, separately from its Owner and Controller.

**Casting Record**:
The facts of a spell's casting, including its source Zone, choices, and payment. An object put onto the Battlefield without being cast has no Casting Record.

**Opening-Hand Action**:
A card-specific action allowed after mulligans and before the first turn.

**Variable Value Source**:
The description of how and when an ability's variable value is determined. It is distinct from the resulting binding, such as X = 3.

**Effect**:
Something that happens as a result of a spell or ability. Effects include one-shot, continuous, replacement, and prevention effects.

**Library Sequence**:
An effect group that inspects successive Library cards, with a stopping condition and handling for selected and remaining cards.

**Object Filter**:
A criterion determining which Game Objects qualify for an ability's condition, event, target, or effect. The using ability or effect determines when characteristics are inspected.

**Zone Change Condition**:
A condition identifying an object's source and destination Zones and whether movement would occur or has occurred. Eligibility is described by an Object Filter; the replacement action or triggered effect is separate.

**Face-Down State**:
A Game Object's concealed identity and the characteristics and procedures that apply while it is face down.

**Meld**:
A relationship between two Card Definitions whose Card Instances can combine into one Game Object with combined characteristics. Each Card Instance retains its own identity and Owner.

**Attachment**:
A relationship in which one Game Object, such as an Aura or Equipment, is attached to another Game Object.

**Object Link**:
A relationship from a source Game Object, optionally identifying the Card Ability involved, to one or more related Game Objects, such as the specific object an ability exiles and later refers to. An Object Link is distinct from an Attachment and does not itself perform game actions.

### Zones and presentation

**Zone**:
A game location holding Game Objects, with rules for visibility, order, and behavior.

**Library**:
A player's ordered, hidden Zone created from their Decklist. Opponents can see its size but not its contents or order.
_Avoid_: Deck (for the in-game zone)

**Hand**:
A player's normally hidden Zone for drawn cards. Revealed cards can be known to opponents without exposing the rest of the Hand.

**Battlefield**:
The shared Zone containing permanents in play.

**Graveyard**:
A player's public Zone for cards put there by game actions, including discards and cards that leave the Battlefield. Its order is preserved.

**Exile**:
The Zone for exiled objects, normally public but also able to contain face-down objects.

**Command Zone**:
A public zone for commanders and other special game objects.

**Stack**:
The shared, ordered Zone containing spells and abilities waiting to resolve.

**Supplementary Deck**:
A collection used by a game variant for cards outside the player's ordinary Library, such as an Attraction deck or planar deck.

**Tapped**:
A Game Object state indicating that a permanent is tapped; legal costs and turn procedures change this status.

**Player Area**:
The portion of the shared Battlefield visually associated with a Match Player. It is not a separate Zone.

**Battlefield Group**:
A visual grouping of permanents within a Player Area according to their current card types. It is not a separate Zone and does not change a permanent's gameplay relationships.
_Avoid_: Zone (for a visual type group)

**Card Pile**:
An expandable visual collection of same-name permanents within a Battlefield Group that share current stats, counters, attachments, and other status, including tapped state. Each member remains an individual Game Object for gameplay choices and actions.
_Avoid_: Stack (for grouped Battlefield permanents)

**Battlefield Layout**:
The visual arrangement of permanents across Player Areas, distinct from gameplay state.

### Stickers

**Sticker Sheet**:
A game aid containing a set of Sticker Definitions. A Match Player's access to stickers is limited to the Sticker Sheets selected for that game.

**Sticker Definition**:
One sticker on a Sticker Sheet, with its rules-relevant kind and value, such as a name, ability, art, or power/toughness sticker. It is catalog data separate from Card Definition and Card Characteristics.

**Sticker Placement**:
The relationship between a Sticker Definition and a Game Object, including placement order.
