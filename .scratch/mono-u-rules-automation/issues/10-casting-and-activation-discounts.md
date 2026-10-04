# 10: Compose casting and activation discounts

**What to build:** Make artifact and Island affinity and source-based discounts reduce the correct spell or activation costs before payment.

**Blocked by:** 07: Resolve ordered effects with suspended choices; 09: Calculate continuous characteristics and Counters.

**Status:** ready-for-agent

- [x] Compose reusable value expressions, filters, cost modifiers, and chosen values in the total-cost calculation.
- [x] Author Etherium Sculptor, Foundry Inspector, Tamiyo's Logbook, and artifact or Island affinity for Thoughtcast, Memory Guardian, Spire Golem, Thought Monitor, and Broodstar.
- [x] Implement each listed card's otherwise available behavior; keep cards with still-missing flying or other abilities unimplemented until those behaviors are supported.
- [x] Apply reductions to the permitted cost component, honor self/other exclusions, and never reduce a payable amount below zero.
- [x] Lock the calculated cost at the correct point so subsequent payment actions cannot recalculate that cast or activation incorrectly.
- [x] Show the adjusted amount during payment and preserve both preproduced-mana and cast-then-produce workflows.
- [x] Verify stacked reducers, counts, chosen X interactions, unchanged colored requirements, and board changes during payment through the command/view seam.

## Comments

Implemented on 2026-10-04 through the agreed command/player-view seam.

Shared source/controller modifiers compose filters, controlled counts, sum expressions and chosen values before locking generic costs. Sculptor, Inspector, Logbook and Thoughtcast are supported. Memory Guardian, Spire Golem, Thought Monitor and Broodstar retain affinity and otherwise available behavior without becoming eligible before later abilities are enforced. Tests cover stacking, other-object exclusions, blue requirements, Island counts, X, clamping and payment-time source sacrifice.

Validation: typechecking passed; the full suite passed all 88 acceptance tests,
including five rules browser tests. Standards review: 0 actionable findings.
Spec review: 0 actionable findings, including the payment-cancellation follow-up.
See `docs/rules-automation.md` and the rules acceptance tests.
