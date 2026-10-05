# 21: Resolve attack-time payments and damage

**What to build:** Resolve Myr Battlesphere and Skysovereign attack abilities using shared triggers, selections, bindings, and damage.

**Blocked by:** 19: Crew Vehicles and expire temporary changes.

**Status:** ready-for-agent

- [x] Author Myr Battlesphere's entry Myr creation and attack-time optional tapping of selected untapped Myr.
- [x] Bind the selected quantity for both the temporary power bonus and the damage instruction.
- [x] Read the current defending player or planeswalker at the prescribed time and handle changed or absent recipients correctly.
- [x] Author Skysovereign's entry/attack trigger, opponent creature-or-planeswalker target filter, and damage alongside its flying and crew behavior.
- [x] Keep these attack-trigger effects separate from ordinary combat-damage assignment and collect resulting triggers appropriately.
- [x] Verify decline, quantity choices, target changes, temporary expiration, and resulting damage with shared controls and persisted resolution.

## Comments

Implemented on 2026-10-05 through the agreed Match command/participant-view and
browser-control seams.

Authored entry/attack triggers, optional Myr tapping, result-bound temporary
power and current-defender damage, and Skysovereign opponent damage targets.
Command/view checks cover quantities, decline, changed/departed defenders, crew,
noncombat attribution and cleanup; resolution choices survive serialization.

See `docs/rules-automation.md` for behavior and staged coverage. Verification and
review are recorded in `../review-21-25.md`.
