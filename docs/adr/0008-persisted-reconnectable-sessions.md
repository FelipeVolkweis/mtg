---
status: accepted
---

# Persisted sessions can resume after disconnects

Rooms, their participants' saved decklists, and the active match are persisted so a disconnected guest can return and continue. A Room remains until a participant closes it or it expires after 30 days without meaningful Room or Match activity; the period is configurable, and connection keepalives do not reset it. The active match is saved as its current state with a revision number; the game does not keep a full action history or completed-match history initially. Replacing an active Match requires confirmation from every current human Match Player. If one is disconnected, the current Match remains available until that player reconnects and confirms. This protects persisted state without requiring replay or event-sourced storage.

The Practice Opponent introduced by [ADR-0016](0016-rules-automated-commander-and-practice.md) has no replacement vote. Reconnect restores pending rules procedures as part of the snapshot; it does not replay actions.
