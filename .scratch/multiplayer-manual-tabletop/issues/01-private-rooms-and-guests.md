# 01: Create private Rooms and join as a guest

**What to build:** Let a small group create and rejoin an invitation-only Room under guest names, with equal participant permissions and no account requirement.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A player can create a private Room and invite others with a link; there is no public lobby or host-only role.
- [ ] A guest can join by choosing a unique name within the Room, without creating a persistent account.
- [ ] A Room accepts two to four participants. A late arrival during an active Match joins the Room but waits for the next Match.
- [ ] The invitation remains valid until the Room is closed or expires.
- [ ] Participants have equal Room permissions.
- [ ] A returning guest can reclaim their participant with a browser-held credential, or with the same Room name while holding the invitation link if that credential is unavailable.
- [ ] Room creation, joining, capacity, name uniqueness, and recovery are verified through user-visible behavior.
