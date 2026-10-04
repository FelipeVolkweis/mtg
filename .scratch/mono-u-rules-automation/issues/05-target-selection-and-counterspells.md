# 05: Choose targets and resolve counterspells

**What to build:** Let players cast targeted instants and respond to spells using shared target controls and correctly resolving Counterspell and Negate.

**Blocked by:** 04: Play lands, produce mana, and cast permanents.

**Status:** ready-for-agent

- [x] Represent reusable target declarations and Object Filters as typed authored data, including spell and noncreature-spell filters.
- [x] Show authorized legal targets through shared controls and record selected targets in the pending casting procedure.
- [x] Support instant casting and responses without bypassing explicit Priority passes or normal payment.
- [x] Revalidate targets during resolution and follow the rules when targets become illegal or the targeted spell cannot be countered.
- [x] Counter the selected spell with correct Zone movement and object identity; distinguish the spell from Ability Game Objects on the Stack.
- [x] Author and verify complete Counterspell and Negate behavior, preserving binary automation status.
- [x] Test target filtering, Stack order, illegal/stale selections, resolution outcomes, and reconnecting during target selection through the player interface.

## Comments

Implemented on 2026-10-04 through the server command/player-view seam, with browser coverage for shared controls and persisted choices. See [rules automation notes](../../../docs/rules-automation.md), `tests/rules.spec.ts`, and `tests/rules-ui.spec.ts`.

Validation: typechecking passed. The full acceptance run passed 59/60; the catalog fixture-size assertion was corrected and its file passed 2/2 on rerun. Post-review rules, browser, and identity checks passed 35/35. Standards review found no hard violations; both duplication findings were fixed. Spec review found no substantive gaps within tickets 01–06.
