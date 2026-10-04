# Manual Match tabletop redesign

## Goal

Make the Manual Match screen card-first and easy to use, with the visual clarity of the EDHPlay and MTG Arena references. The first release remains manual: players make game decisions and resolve card effects themselves. Card images are essential; decorative battlefield art can wait.

## Table

- The Battlefield remains one shared Zone and one shared card arrangement. It has one visual Player Area per Match Player, colored with an accent unrelated to Magic color or deck Color Identity. Player names remain visible alongside color.
- Four Match Players use a 2×2 table. Three use two opponent areas above a wider local area; two use opposing top and bottom areas; a Solo Match uses the full table. Each viewer sees their own area nearest the bottom.
- The match table fits the laptop viewport initially, without page scrolling. Each viewer can zoom with the wheel, pan with Space-drag, and restore the overview with a visible Fit table button. Navigation is local and does not move cards for anyone else. Zone drawers may scroll internally. Cards can be placed freely; there is no automatic type grouping, alignment, or stacking.
- A permanent that changes Controller moves to the new Controller's Player Area while retaining its Owner. Dragging a permanent into another area only changes its visual position; changing Controller requires an explicit action.
- The Stack is prominent in a shared central space. Compact indicators near each player open that player's public zones and their own private zones as allowed by the existing visibility policy.

## Cards and controls

- Show card images on cards whose identity is visible. Holding Alt while hovering over a visible card shows its full image. Clicking selects a card; dragging moves it. Double-clicking a permanent or pressing T with it selected toggles tapped state. A card menu offers common actions, with the detailed inspector for less common state changes.
- Keep the local player's Hand visible along the bottom. Show opponents' Hands as counts and concealed card backs. Tint each opponent's card backs within the same color family as that player's Battlefield accent, with enough hue or shade difference to distinguish them; choose accessible defaults during implementation.
- Keep life, turn, and zone controls close to the players and cards they affect. Do not add an undo action; players correct mistakes manually.
- Any Room Participant may manipulate public cards, as in the existing Manual Match. Player Area colors do not indicate action permissions.

## Opening setup

- Show the table immediately, with guided opening controls beside the local player's Hand. The opening draw produces seven cards.
- A Mulligan action returns that player's Hand to their Library, shuffles, draws seven cards, and increments their Mulligan Count. The app does not enforce or remind players about cards to put on the bottom of the Library.
