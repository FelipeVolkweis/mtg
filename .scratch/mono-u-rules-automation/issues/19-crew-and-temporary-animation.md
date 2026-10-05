# 19: Crew Vehicles and expire temporary changes

**What to build:** Let players crew Vehicles using selected creatures and attack or block with their temporarily animated permanents.

**Blocked by:** 18: Apply combat damage and determine outcomes.

**Status:** ready-for-agent

- [x] Express crew as selecting and tapping eligible creatures whose total effective power meets the requirement.
- [x] Keep crew payment distinct from tap-symbol mana abilities, including its rules for newly controlled creatures.
- [x] Apply temporary artifact-creature changes while retaining existing characteristics and using applicable Vehicle stats.
- [x] Author Cultivator's Caravan and the crew portions of Thopter Fabricator and Skysovereign, with normal mana or other already supported abilities.
- [x] Enforce attack eligibility of the resulting creature separately from eligibility of creatures used to crew.
- [x] Expire the animation at the prescribed duration without losing unrelated grants, Counters, or other continuous changes.
- [x] Verify crew selection controls, insufficient power, source changes, combat participation, and cleanup; unfinished other Vehicle abilities keep definitions unimplemented.

## Comments

Implemented on 2026-10-04 through the agreed Match command/participant-view and
browser-control seams. See `docs/rules-automation.md` for behavior and staged
card coverage. Verification and review are recorded in `../review-16-20.md`.
