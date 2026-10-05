---
status: accepted
---

# Persisted sessions can resume after disconnects

Rooms, their participants' saved Decklists, and the active Match are persisted so a disconnected guest can return and continue. A Room remains until a participant closes it or it expires after 30 days without meaningful Room or Match activity; the period is configurable, and connection keepalives do not reset it. The active Match is saved as its current state with a revision number; the game keeps no action history or completed-Match history. Replacing an active Match requires confirmation from every current human Match Player. If one is disconnected, the current Match remains available until that player reconnects and confirms. This protects persisted state without requiring replay or event-sourced storage.
