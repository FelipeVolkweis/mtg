# Implementation review: tickets 26–30

Reviewed working changes from starting commit
`3047f576415c4496883df2e9d9ce29593d46b681` on `main`, using
`git diff <starting-commit>` before the requested final commit, including new
source files. The code-review skill's two axes ran independently in read-only
agents against the feature spec, tickets 26–30, agent documentation and ADRs.

## Standards

No documented-standard breaches found. The implementation retains server-owned
commands, authored executable card definitions, participant-specific views and
persisted choices. Domain documentation supersedes the former manual gameplay
and one-player practice decisions without replacing catalog/session authority.

One optional Duplicated Code smell was resolved: solo acting-player delegation
now lives in `match-players.ts`, shared by command authorization, private choices
and Commander replacement replay. The follow-up Standards review found no
remaining actionable findings.

Standards: 0 breaches, 1 optional smell resolved; 0 actionable findings remaining.

## Spec

The review identified five correctness gaps, each corrected with regressions:

- Commander Graveyard returns checked the first player's Zone; eligibility now
  checks the moved object's Zone kind, covering both owners.
- Ward/Improvise eligibility accepted empty keyword envelopes; the gate now
  requires their actual authored trigger/payment/counter or improvise behavior.
- Monarch combat-transfer triggers belonged to the attacker; they now belong to
  the monarch, preserving APNAP ordering with Research Thief and the recorded
  damaging controller as the transfer beneficiary.
- Unattached Auras survived after their creature left; checkpoints now put them
  in their owner's Graveyard while keeping the monarch designation.
- Cycling/Affinity eligibility likewise accepted keyword-only envelopes; the
  gate requires a Hand discard/mana/draw activation or an actual source casting
  reduction counting the controller's Battlefield permanents.

The initial full suite also exposed a browser test reload race after producing
attack-payment mana. The test now waits for the public mana update before
reloading, then verifies the restored payment and completed combat declaration.

The independent follow-up review verified both final fixes and found no
remaining actionable Spec findings.

Spec: 5 findings resolved; 0 findings remaining.

## Verification

Tests use `MatchService.execute`, participant-specific `matchView` and browser
controls over the existing WebSocket protocol. New behavior and review fixes
were exercised with failing regressions before implementation, followed by
focused checks and regular typechecking.

Coverage includes improvise with reductions and atomic invalid payment, Ward
pay/decline/multiple triggers/source removal, Monument immediate multi-unit mana
and cast life gain, Aura entry/cleanup/untap, monarch transfer/draw and APNAP,
Command casting/tax/reducers/return/replay/stale answers, commander combat loss,
Launch Mishap, AEtherize, Whirler Rogue, the Affinity creatures, full 100-card /
67-definition Commander eligibility and mirror instantiation, solo required
choices/privacy/spectators/automatic passes, human replacement consent, legacy
Match replacement, and restart recovery during casting, resolution selection,
trigger ordering and practice choices.

Final verification: typechecking passed, formatting checks passed,
`git diff --check` passed, and the full Playwright suite passed all 179 tests
(2.0 minutes).

Standards: 0 remaining findings. Spec: 0 remaining findings.
