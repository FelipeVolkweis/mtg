# 05: Track manual table state

**What to build:** Let participants record shared life, turn, counter, Stack, and outcome information while keeping the Match fully manual.

**Blocked by:** Multiplayer Magic Tabletop #04: Synchronize card and Zone actions

**Status:** ready-for-agent

- [ ] Each Match Player has a configurable starting Life Total and manually editable current Life Total.
- [ ] Participants choose the starting player by rolling dice; turn order proceeds clockwise by default and can be adjusted.
- [ ] Turn State records active Match Player, turn number, phase, and step. Participants can move through phases and steps forward or backward, or select one directly to correct the marker.
- [ ] Turn State is informational and never restricts manual actions.
- [ ] Counters can be placed on a Game Object or Match Player, distinguish kinds such as +1/+1, -1/-1, and category counters, and accept arbitrary signed integer quantities without automatically changing characteristics.
- [ ] The Stack can contain spell Game Objects and text-only Ability Game Objects without Card Instances; participants add and resolve them manually without Priority enforcement.
- [ ] Participants can record Match Player statuses and an overall Game Outcome of ongoing, complete, or draw without rule evaluation.
- [ ] Match Player statuses distinguish still playing, won, and lost; Rules State distinguishes statuses from designations, and counters remain separate.
- [ ] Behavior tests verify these values synchronize and remain manual markers rather than causing card or turn effects.
