# 01: Prepare the rules command interface

**What to build:** Separate gameplay execution from Room transport and participant views so subsequent rules slices share one command interface while existing behavior remains verifiable.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] Route gameplay commands through a defined execution interface without changing existing Room, Match, revision, or participant-view behavior.
- [x] Keep transport, authorization, persistence, and projection responsibilities outside individual card behavior.
- [x] Provide a place for accepted transitions, rejected actions, and pending input requests without exposing unrestricted fixture commands to players.
- [x] Retain existing synchronization, privacy, stale-action, and recovery acceptance tests through the public command/view seam.
- [x] Keep this prefactor green independently; any temporary compatibility with manual execution exists only to support migration and is removed by ticket 30.

## Comments

Implemented on 2026-10-04 through the server command/player-view seam, with browser coverage for shared controls and persisted choices. See [rules automation notes](../../../docs/rules-automation.md), `tests/rules.spec.ts`, and `tests/rules-ui.spec.ts`.

Validation: typechecking passed. The full acceptance run passed 59/60; the catalog fixture-size assertion was corrected and its file passed 2/2 on rerun. Post-review rules, browser, and identity checks passed 35/35. Standards review found no hard violations; both duplication findings were fixed. Spec review found no substantive gaps within tickets 01–06.
