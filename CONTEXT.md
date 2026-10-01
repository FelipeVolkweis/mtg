# Magic Tabletop

Shared language for a multiplayer Magic tabletop game in which players manipulate cards and the rules are initially handled manually.

## Language

**Room**:
An invitation-only online session in which two to four guest players can play successive matches together.

**Guest player**:
A person playing in a room under a chosen name, without a persistent account.

**Room Participant**:
A guest player's identity within a room, retained across successive matches.

**Match**:
One game of Magic played by the participants in a room.

**Match Player**:
A room participant's role in one match, including their seat and match-specific state.

**Manual Match**:
A match where players perform card actions and resolve card effects themselves, while the game tracks basic table actions.

**Rules-Automated Match**:
A match where the game enforces modeled rules for a supported pool of cards.

**Game state**:
The current players, Card Instances, Game Objects, and Zones in a match, including information each player may see.

**Card Catalog**:
The locally stored collection of card definitions and printings available to the game.

**Card Definition**:
The rules identity and shared characteristics of a card, independent of its edition or artwork.

**Card Printing**:
A specific version of a card definition from a set, with its own collector number and artwork.

**Card Instance**:
One specific copy of a Card Printing created from a Deck Entry when a Match starts. It retains its identity and owner as it moves between Zones.

**Game Object**:
A card, token, or ability as it currently exists in the Match, with its current Zone, controller, and game state. A Card Instance can be represented by successive Game Objects as it changes Zones; some rules create exceptions. A Game Object may exist without a Card Instance, such as an ability on the Stack.

**Owner**:
The Match Player whose deck supplied a Card Instance. Ownership remains with that player when control changes.

**Controller**:
The Match Player currently controlling a Game Object. The controller may differ from the Card Instance's owner.

**Zone**:
A game location that holds Game Objects; its kind determines visibility, order, and behavior. Each Match Player has a Library, Hand, and Graveyard; the Battlefield, Stack, Exile, and Command Zone are shared by the Match. Visibility normally follows the Zone kind but can vary for individual objects.
_Modeling direction_: Prefer specialized Zone types built on a common Zone base class. Define their required behavior before settling the implementation.
_Rules reference_: [Wizards Comprehensive Rules](https://magic.wizards.com/en/rules), section 400.

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
A shared, public, ordered Zone containing spells and abilities waiting to resolve. An ability may be on the Stack without a Card Instance.

**Tapped**:
A Game Object state indicating that a permanent is tapped; players can tap and untap permanents manually.

**Decklist**:
A private, reusable list owned by a room participant, containing card quantities and optional exact printings.

**Deck Entry**:
One card and quantity in a decklist, optionally identifying a specific printing.
