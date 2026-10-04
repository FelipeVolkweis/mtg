# 10: Compose casting and activation discounts

**What to build:** Make artifact and Island affinity and source-based discounts reduce the correct spell or activation costs before payment.

**Blocked by:** 07: Resolve ordered effects with suspended choices; 09: Calculate continuous characteristics and Counters.

**Status:** ready-for-agent

- [ ] Compose reusable value expressions, filters, cost modifiers, and chosen values in the total-cost calculation.
- [ ] Author Etherium Sculptor, Foundry Inspector, Tamiyo's Logbook, and artifact or Island affinity for Thoughtcast, Memory Guardian, Spire Golem, Thought Monitor, and Broodstar.
- [ ] Implement each listed card's otherwise available behavior; keep cards with still-missing flying or other abilities unimplemented until those behaviors are supported.
- [ ] Apply reductions to the permitted cost component, honor self/other exclusions, and never reduce a payable amount below zero.
- [ ] Lock the calculated cost at the correct point so subsequent payment actions cannot recalculate that cast or activation incorrectly.
- [ ] Show the adjusted amount during payment and preserve both preproduced-mana and cast-then-produce workflows.
- [ ] Verify stacked reducers, counts, chosen X interactions, unchanged colored requirements, and board changes during payment through the command/view seam.
