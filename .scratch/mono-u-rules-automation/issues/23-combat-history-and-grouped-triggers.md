# 23: Track combat history and grouped triggers

**What to build:** Resolve individual and grouped combat-damage triggers and Steel Hellkite's history-dependent activation.

**Blocked by:** 13: Resolve destruction, exile, and mass sacrifice; 18: Apply combat damage and determine outcomes.

**Status:** ready-for-agent

- [x] Preserve bounded current-turn damage attribution to the player damaged by the relevant source object.
- [x] Author Research Thief's individual artifact-creature combat-damage trigger and Thopter Spy Network's grouped combat trigger.
- [x] Distinguish multiple creatures damaging one player from 'one or more' grouping in the produced trigger instances.
- [x] Author Steel Hellkite's chosen-X destruction filtered by mana value and the controllers damaged by it this turn.
- [x] Enforce Steel Hellkite's once-per-turn activation limit and support its temporary power activation and flying.
- [x] Reset usage and attribution at the appropriate turn transition and handle a source leaving/reentering without transferring unrelated history.
- [x] Verify two-creature damage, different recipients, rejected repeated activation, and public results through actual combat and ability commands.

## Comments

Implemented on 2026-10-05 through the agreed Match command/participant-view and
browser-control seams.

Added grouped damage trigger collection and authored Thief/Network draws plus
Hellkite chosen-X destruction and temporary power. Command/view combat checks
verify individual versus grouped draws, mana-value/recipient filtering, usage
limits, turn resets and fresh source lifetimes.

See `docs/rules-automation.md` for behavior and staged coverage. Verification and
review are recorded in `../review-21-25.md`.
