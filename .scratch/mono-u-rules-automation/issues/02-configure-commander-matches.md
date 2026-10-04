# 02: Configure Commander Matches

**What to build:** Let two Room Participants configure a Commander Match, designate commanders, validate their Decklists, and complete opening procedures through the application.

**Blocked by:** 01: Prepare the rules command interface.

**Status:** ready-for-agent

- [x] Expose Commander format selection and commander selection from each selected Decklist before shuffling or opening draws.
- [x] Validate commander eligibility, Color Identity, relevant Decklist construction, and complete automation eligibility; explain unsupported cards without treating imported keywords as implemented behavior.
- [x] Record commander designation on Card Instances, place selected commanders in the Command Zone, and keep both players' instances and Libraries independent.
- [x] Apply Commander starting life, starting-player selection, opening-hand draws, and legal mulligans with private player views.
- [x] Verify Sai and Padeem eligibility and reject Graaz for the unchanged blue sample without branching on card names in setup code.
- [x] Use isolated fully supported fixtures to verify early setup while the production mono-U pool is incomplete; do not mark unfinished production definitions implemented.
- [x] Persist setup choices and preserve the existing consent requirements for replacing active Matches.

## Comments

Implemented on 2026-10-04 through the server command/player-view seam, with browser coverage for shared controls and persisted choices. See [rules automation notes](../../../docs/rules-automation.md), `tests/rules.spec.ts`, and `tests/rules-ui.spec.ts`.

Validation: typechecking passed. The full acceptance run passed 59/60; the catalog fixture-size assertion was corrected and its file passed 2/2 on rerun. Post-review rules, browser, and identity checks passed 35/35. Standards review found no hard violations; both duplication findings were fixed. Spec review found no substantive gaps within tickets 01–06.
