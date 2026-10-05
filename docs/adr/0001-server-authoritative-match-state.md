---
status: accepted
---

# Server-authoritative match state

The server owns canonical Match state. Clients submit proposed actions over WebSocket; the server applies them in order against the latest state, rejects actions invalidated by earlier changes, assigns revisions to accepted changes, and publishes a private view to each player. Gameplay permissions follow [ADR-0016](0016-rules-automated-commander-and-practice.md); spectators receive permitted views but cannot act. This keeps one shared result for all players; a browser-hosted Match would make consistency and availability depend on one participant's client.
