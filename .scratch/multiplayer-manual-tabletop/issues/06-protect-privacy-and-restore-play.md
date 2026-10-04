# 06: Protect privacy and restore play

**What to build:** Preserve participant-specific privacy and let a disconnected group resume the latest active Manual Match, while requiring consent before replacing it.

**Blocked by:** Multiplayer Magic Tabletop #05: Track manual table state

**Status:** ready-for-agent

- [ ] The owner can see their Hand and Library contents; opponents can see counts but not identities or Library order. Public Zones remain visible.
- [ ] A face-down Game Object's identity is redacted from participants who may not inspect it.
- [ ] Rooms, Room Participants, saved Decklists, and current Match state persist across disconnects. Reconnect restores the latest revision and the returning participant's correctly redacted view.
- [ ] If a Match Player is disconnected, a request to replace the active Match waits for that player to reconnect and confirm.
- [ ] When connected, every current Match Player must confirm before a new Match replaces the active one. The Room and saved Decklists remain available after replacement.
- [ ] A Room expires after 30 days without meaningful Room or Match activity by default; the duration is configurable, and connection keepalives do not reset it. A participant can also close the Room.
- [ ] Integration tests cover reconnect, privacy redaction, expiry, late arrival, and rematch confirmation, without storing a full action history or completed-Match archive.
