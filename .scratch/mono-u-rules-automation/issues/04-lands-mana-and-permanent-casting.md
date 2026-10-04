# 04: Play lands, produce mana, and cast permanents

**What to build:** Let players play lands, activate mana abilities, and cast simple permanents using either preproduced mana or a casting payment window.

**Blocked by:** 03: Advance turns through explicit Priority passes.

**Status:** ready-for-agent

- [x] Implement typed validated rules data sufficient for intrinsic Island mana, Sol Ring mana, land plays, and simple permanent casting/resolution.
- [x] Enforce land-play limits, casting permissions, creature tap-symbol restrictions where applicable, and Priority ownership.
- [x] Allow players to activate chosen mana abilities before casting or during the permitted casting payment window; never activate additional sources automatically.
- [x] Calculate and lock total cost at the prescribed point, persist pending casting input, and distinguish mana abilities from ordinary Stack abilities.
- [x] Spend existing pool mana automatically by mana type: reserve specific requirements, use largest remaining colored quantities for generic costs, then colorless, with documented deterministic ties and preserved restrictions.
- [x] Retain unused mana and relevant Casting Record facts; reject insufficient payments without resource duplication or a half-completed committed cast.
- [x] Resolve completed permanent spells after explicit passes and retain Card Instance identity across the required Game Object changes.
- [x] Verify both payment workflows, source selection controls, greedy allocation, stale input rejection, and recovery during a pending cast.

## Comments

Implemented on 2026-10-04 through the server command/player-view seam, with browser coverage for shared controls and persisted choices. See [rules automation notes](../../../docs/rules-automation.md), `tests/rules.spec.ts`, and `tests/rules-ui.spec.ts`.

Validation: typechecking passed. The full acceptance run passed 59/60; the catalog fixture-size assertion was corrected and its file passed 2/2 on rerun. Post-review rules, browser, and identity checks passed 35/35. Standards review found no hard violations; both duplication findings were fixed. Spec review found no substantive gaps within tickets 01–06.
