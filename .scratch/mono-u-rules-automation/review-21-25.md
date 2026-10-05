# Implementation review: tickets 21–25

Reviewed working changes from starting commit
`e913637662563da32a356d28826388d59235597c` on `main`, using
`git diff <starting-commit>` before the requested final commit. The code-review
skill's two axes ran independently in read-only agents against the feature spec,
tickets 21–25, the agent documentation and relevant ADRs.

## Standards

No documented-standard breaches found. Server ownership, persisted choices,
separate Ability Game Objects, authored card data and the agreed command/view
acceptance seam remain intact.

The initial review noted one optional Duplicated Code smell: Signpost prompt
construction and answer validation independently filtered attack destinations.
`Combat.redirectDestinations` now owns that eligibility and serves both callers.
The follow-up review found no actionable baseline smells or standard breaches.
Revealed-Hand rendering uses only identities already projected by the server.

Standards: 0 breaches, 1 optional smell resolved; 0 actionable findings remaining.

## Spec

The initial review found one P2 issue: Omnitool's selected artifact was included
in the opponent's object projection but not displayed in the browser because its
private Hand lacked a complete object list. The browser now displays revealed
Hand identities while concealing unrelated cards. A focused browser regression
checks private inspection, reload of the same pending choice, the public reveal,
and preservation of that reveal after the opponent reconnects.

The independent follow-up review found no remaining concrete missing
requirements, incorrect behavior or scope creep within tickets 21–25.

Spec: 1 finding resolved; 0 findings remaining.

## Verification

Tests use `MatchService.execute`, participant-specific `matchView`, and browser
controls over the existing WebSocket protocol. Principal card slices ran red
before their authored behavior was implemented; typechecking and targeted tests
ran throughout.

Coverage includes optional Myr quantities, changed and absent attack recipients,
Skysovereign entry/attack targeting and crew, short/empty Library inspection and
reveal privacy, legal redirection without replayed attack events, individual and
grouped combat triggers, Hellkite X/payment/usage/source-lifetime rules, draw
ordinals and turn reset, Crawler life loss and whole-resolution checkpoints,
Vessel cleanup, resolution-time mana production/payment/decline and recovery,
conditional grants, tied artifact maxima, intervening conditions and selected tap
costs. All fourteen completed card definitions pass normal Commander setup.

Final verification: typechecking passed, formatting checks passed,
`git diff --check` passed, and the full Playwright suite passed all 160 tests
(2.2 minutes).

Standards: 0 remaining findings. Spec: 0 remaining findings.
