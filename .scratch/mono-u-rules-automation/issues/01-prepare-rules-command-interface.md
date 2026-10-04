# 01: Prepare the rules command interface

**What to build:** Separate gameplay execution from Room transport and participant views so subsequent rules slices share one command interface while existing behavior remains verifiable.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] Route gameplay commands through a defined execution interface without changing existing Room, Match, revision, or participant-view behavior.
- [ ] Keep transport, authorization, persistence, and projection responsibilities outside individual card behavior.
- [ ] Provide a place for accepted transitions, rejected actions, and pending input requests without exposing unrestricted fixture commands to players.
- [ ] Retain existing synchronization, privacy, stale-action, and recovery acceptance tests through the public command/view seam.
- [ ] Keep this prefactor green independently; any temporary compatibility with manual execution exists only to support migration and is removed by ticket 30.
