# 04: Play lands, produce mana, and cast permanents

**What to build:** Let players play lands, activate mana abilities, and cast simple permanents using either preproduced mana or a casting payment window.

**Blocked by:** 03: Advance turns through explicit Priority passes.

**Status:** ready-for-agent

- [ ] Implement typed validated rules data sufficient for intrinsic Island mana, Sol Ring mana, land plays, and simple permanent casting/resolution.
- [ ] Enforce land-play limits, casting permissions, creature tap-symbol restrictions where applicable, and Priority ownership.
- [ ] Allow players to activate chosen mana abilities before casting or during the permitted casting payment window; never activate additional sources automatically.
- [ ] Calculate and lock total cost at the prescribed point, persist pending casting input, and distinguish mana abilities from ordinary Stack abilities.
- [ ] Spend existing pool mana automatically by mana type: reserve specific requirements, use largest remaining colored quantities for generic costs, then colorless, with documented deterministic ties and preserved restrictions.
- [ ] Retain unused mana and relevant Casting Record facts; reject insufficient payments without resource duplication or a half-completed committed cast.
- [ ] Resolve completed permanent spells after explicit passes and retain Card Instance identity across the required Game Object changes.
- [ ] Verify both payment workflows, source selection controls, greedy allocation, stale input rejection, and recovery during a pending cast.
