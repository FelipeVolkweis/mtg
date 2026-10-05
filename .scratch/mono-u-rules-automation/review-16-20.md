# Implementation review: tickets 16–20

Reviewed the working changes from starting commit
`2d2a9c23916d02eaf11362d0f59b57c60772da11` on `main`, including the new
Combat module, against the feature spec and tickets 16–20. Review occurred before
the requested final commit, using `git diff <starting-commit>` plus new files.
The two axes ran independently in read-only agents using the code-review skill.

## Standards

No documented-standard breaches or actionable baseline smells found.

The changes keep authoritative rules behavior inside Match (ADR-0001/0009),
share typed browser/server contracts (ADR-0012), preserve ability Game Objects
on the Stack (ADR-0011), and author executable behavior separately from imported
characteristics with staged automation eligibility (ADR-0005). Combat remains a
focused Match collaborator, consistent with existing resolution and trigger
modules. Issue updates retain separate ticket files and append implementation
notes under `## Comments`, consistent with `docs/agents/issue-tracker.md`.

The follow-up review found no newly actionable Standards concerns. Effective
characteristics, attachment legality, checkpoints and turn state remain owned by
Match. Regression tests use the agreed Match command/participant-view seam.

Standards findings: 0.

## Spec

The initial review found three P2 issues:

1. Equipment attachment checked printed Creature types, preventing a crewed
   Vehicle from receiving Equipment despite its legal effective target status.
2. Cleanup did not detach Equipment when animation expired and its recipient
   ceased being a Creature.
3. Damage attribution persisted across turns rather than expiring the spec's
   current-turn facts.

All three findings were fixed and independently rechecked. Attachment validation
now uses effective types. Checkpoints detach illegal Equipment, including after
animation expires, and cleanup offers the required Priority window. Damage
attribution expires at the next turn. New command/view regressions verify
attachment, composed bonuses, retained Counters, cleanup and attribution duration.

Accepting validated damage effects in the automation capability gate matches
ticket 18's reusable noncombat-damage operation. No other concrete missing
requirements or scope creep were found within tickets 16–20. Later card abilities
remain deliberately unimplemented.

Spec findings: 3 initially, all resolved; 0 remaining.

## Verification

The agreed seams are `MatchService.execute` and participant-specific `matchView`,
plus browser controls using the same WebSocket command protocol. Each principal
slice ran red before green; targeted tests and typechecking ran throughout.

Final validation: typechecking passed, `git diff --check` passed, and the full
Playwright suite passed all 124 tests (1.9 minutes). The existing card-drag test
now waits for the drawn card to appear before reading its snapshot, removing a
race with command completion. Standards review rechecked that test adjustment
and found no concerns.

Standards: 0 findings. Spec: 3 fixed, 0 remaining. Neither axis has an unresolved issue.
