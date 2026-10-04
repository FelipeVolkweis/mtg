# 22: Resolve attack-triggered selection and redirection

**What to build:** Complete Adaptive Omnitool's attack-time Library sequence and Misleading Signpost's legal attack redirection.

**Blocked by:** 11: Inspect Libraries and handle state triggers; 14: Attach Equipment and resolve living weapon; 16: Enforce protection and casting permissions; 17: Declare attackers and blockers legally.

**Status:** ready-for-agent

- [ ] Author Adaptive Omnitool's equipped-creature attack trigger and private top-six inspection, including short Libraries.
- [ ] Allow optional artifact selection, reveal the selected card as required, move it to Hand, and place remaining cards on the bottom in random order.
- [ ] Verify no-selection/no-artifact cases, privacy, shared selection controls, and preservation of the card's equip and bonus behavior.
- [ ] Author Misleading Signpost's flash, blue mana, declare-attackers-step entry condition, target selection, and optional defender reselection.
- [ ] Reject illegal attack destinations, including the attacking creature's controller or that controller's permanents.
- [ ] Retain an attacking creature's identity while updating its destination, with no undeclared new attacker or replayed attack event.
- [ ] Verify redirection timing, changed recipients, short-Library ordering, and reconnects during the private sequence through the command/view seam.
