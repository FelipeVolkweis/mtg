# 23: Track combat history and grouped triggers

**What to build:** Resolve individual and grouped combat-damage triggers and Steel Hellkite's history-dependent activation.

**Blocked by:** 13: Resolve destruction, exile, and mass sacrifice; 18: Apply combat damage and determine outcomes.

**Status:** ready-for-agent

- [ ] Preserve bounded current-turn damage attribution to the player damaged by the relevant source object.
- [ ] Author Research Thief's individual artifact-creature combat-damage trigger and Thopter Spy Network's grouped combat trigger.
- [ ] Distinguish multiple creatures damaging one player from 'one or more' grouping in the produced trigger instances.
- [ ] Author Steel Hellkite's chosen-X destruction filtered by mana value and the controllers damaged by it this turn.
- [ ] Enforce Steel Hellkite's once-per-turn activation limit and support its temporary power activation and flying.
- [ ] Reset usage and attribution at the appropriate turn transition and handle a source leaving/reentering without transferring unrelated history.
- [ ] Verify two-creature damage, different recipients, rejected repeated activation, and public results through actual combat and ability commands.
