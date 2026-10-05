# 26: Pay improvise and resolve ward

**What to build:** Complete Kappa Cannoneer with explicit improvise payment and ward responses through shared casting and trigger controls.

**Blocked by:** 10: Compose casting and activation discounts; 16: Enforce protection and casting permissions; 17: Declare attackers and blockers legally.

**Status:** ready-for-agent

- [x] Support improvise as tapping selected artifacts for the permitted generic payment after the mana-ability window, not as producing pool mana.
- [x] Compose improvise with cost reductions, locked costs, already tapped artifacts, and existing greedy pool spending.
- [x] Author ward's trigger when applicable targeting occurs, the responsible player's optional payment, and countering when payment is not made.
- [x] Author Kappa Cannoneer's own/other controlled-artifact entry trigger, +1/+1 Counter, and temporary unblockability.
- [x] Use shared choices and Priority rules for ward and distinguish that resolution payment from the original casting cost.
- [x] Verify multiple applicable triggers, payment/decline, changed targets, source removal, Counter changes, and duration expiration through the player interface.
- [x] Mark Kappa Cannoneer implemented only when all of these behaviors are covered.

## Comments

Implemented on 2026-10-05 through the agreed Match command/participant-view and
browser-control seams.

Completed Kappa Cannoneer with selected-artifact improvise payment, ward
trigger/payment/counter behavior, entry Counters and temporary unblockability.
Checks cover reductions, atomic invalid selections, mana-source competition,
ward payment/decline, multiple wards, source removal and duration expiry.

See `docs/rules-automation.md` for behavior. Verification and the independent
Standards/Spec reviews are recorded in `../review-26-30.md`.
