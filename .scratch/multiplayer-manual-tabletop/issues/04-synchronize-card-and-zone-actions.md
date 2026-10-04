# 04: Synchronize card and Zone actions

**What to build:** Give Match Players one shared Manual Match state where card movements and common Zone actions are synchronized consistently without enforcing Magic legality.

**Blocked by:** Multiplayer Magic Tabletop #03: Start a Match from ready Decklists

**Status:** ready-for-agent

- [ ] The Match has one authoritative current state. Accepted actions are ordered, assigned an increasing revision, and reflected in participant views.
- [ ] A card drag is committed on mouse release. Public Game Objects can be manipulated by any participant; a player generally inspects and manipulates cards in their own private Hand and Library.
- [ ] The shared Battlefield is spatial in the initial layout, and positions are stored separately from rules state so another layout can be added later. The full-play experience targets desktop and laptop PCs.
- [ ] Participants can move cards freely among Zones in a Manual Match without card, Decklist, timing, or effect legality checks.
- [ ] Each Match Player has an ordered hidden Library, hidden Hand, and public Graveyard; the Match has a shared Battlefield, Stack, Exile, and Command Zone.
- [ ] Participants can shuffle their own Library, draw from it, position cards on a shared spatial Battlefield, and tap or untap permanents manually.
- [ ] A manually resolved card cost or effect can move a specific known Game Object into another player's private Hand or Library without exposing other contents.
- [ ] Stale or conflicting actions are rejected and the participant receives the latest view they are allowed to see.
- [ ] An integration test verifies synchronization between two participants, Zone behavior, accepted revisions, and stale-action recovery.
