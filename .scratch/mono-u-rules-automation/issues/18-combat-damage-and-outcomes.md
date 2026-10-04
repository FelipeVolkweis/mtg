# 18: Apply combat damage and determine outcomes

**What to build:** Resolve combat damage, creature deaths, and player losses automatically once legal combat declarations are complete.

**Blocked by:** 12: Move objects through costs and resolving effects; 17: Declare attackers and blockers legally.

**Status:** ready-for-agent

- [ ] Support legal combat-damage assignments and simultaneous application for attackers and blockers in the selected pool.
- [ ] Treat damage separately from direct life loss and retain source and recipient information for subsequent consumers.
- [ ] Apply lethal-damage and other applicable state-based actions at rules-defined checkpoints, producing correct death events and outcomes.
- [ ] Support rules-level noncombat damage as a reusable operation without introducing a separate manual damage command.
- [ ] Remove marked damage during cleanup and update combat membership appropriately as objects leave.
- [ ] Handle applicable zero/negative-life and failed-draw losses and transition completed Matches consistently.
- [ ] Verify blocked/unblocked combat, multiple blockers, simultaneous deaths, effective toughness changes, and player losses through real commands.
