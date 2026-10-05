# 18: Apply combat damage and determine outcomes

**What to build:** Resolve combat damage, creature deaths, and player losses automatically once legal combat declarations are complete.

**Blocked by:** 12: Move objects through costs and resolving effects; 17: Declare attackers and blockers legally.

**Status:** ready-for-agent

- [x] Support legal combat-damage assignments and simultaneous application for attackers and blockers in the selected pool.
- [x] Treat damage separately from direct life loss and retain source and recipient information for subsequent consumers.
- [x] Apply lethal-damage and other applicable state-based actions at rules-defined checkpoints, producing correct death events and outcomes.
- [x] Support rules-level noncombat damage as a reusable operation without introducing a separate manual damage command.
- [x] Remove marked damage during cleanup and update combat membership appropriately as objects leave.
- [x] Handle applicable zero/negative-life and failed-draw losses and transition completed Matches consistently.
- [x] Verify blocked/unblocked combat, multiple blockers, simultaneous deaths, effective toughness changes, and player losses through real commands.

## Comments

Implemented on 2026-10-04 through the agreed Match command/participant-view and
browser-control seams. See `docs/rules-automation.md` for behavior and staged
card coverage. Verification and review are recorded in `../review-16-20.md`.
