# 03: Start a Match from ready Decklists

**What to build:** Let any Room Participant start a Manual Match for the ready group and create fresh in-game cards from each selected Decklist.

**Blocked by:** Multiplayer Magic Tabletop #02: Save and validate private Decklists

**Status:** ready-for-agent

- [ ] Any Room Participant can start a Match when two to four participants have selected a saved Decklist and marked ready.
- [ ] Only ready participants are included in the Match, and each becomes a Match Player distinct from their Room Participant identity.
- [ ] Every Deck Entry creates the correct number of fresh Card Instances in its Match Player's Library, with the selected/default printing and Owner retained.
- [ ] Starting a Match does not change any saved Decklist.
- [ ] After creation, each player can shuffle and draw from their own Library manually.
- [ ] Behavior tests cover two-, three-, and four-player starts, selected Decklists, Card Instance counts/ownership, and saved-list immutability.
