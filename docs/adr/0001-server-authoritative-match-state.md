---
status: accepted
---

# Server-authoritative match state

The server owns the canonical match state for multiplayer rooms, and clients submit actions when a move is committed, such as when a drag ends. A WebSocket connection carries actions to the server and publishes accepted changes back to players. The server applies actions in order against the latest state, rejects actions invalidated by an earlier change, assigns revisions to accepted changes, and sends each player a view that respects private zones. Gameplay permissions follow the Rules-Automated Match policy in [ADR-0016](0016-rules-automated-commander-and-practice.md); spectators receive permitted views but cannot act. This keeps one shared result for all players; a browser-hosted match would make consistency and host availability depend on one player's client.
