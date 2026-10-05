# 22: Resolve attack-triggered selection and redirection

**What to build:** Complete Adaptive Omnitool's attack-time Library sequence and Misleading Signpost's legal attack redirection.

**Blocked by:** 11: Inspect Libraries and handle state triggers; 14: Attach Equipment and resolve living weapon; 16: Enforce protection and casting permissions; 17: Declare attackers and blockers legally.

**Status:** ready-for-agent

- [x] Author Adaptive Omnitool's equipped-creature attack trigger and private top-six inspection, including short Libraries.
- [x] Allow optional artifact selection, reveal the selected card as required, move it to Hand, and place remaining cards on the bottom in random order.
- [x] Verify no-selection/no-artifact cases, privacy, shared selection controls, and preservation of the card's equip and bonus behavior.
- [x] Author Misleading Signpost's flash, blue mana, declare-attackers-step entry condition, target selection, and optional defender reselection.
- [x] Reject illegal attack destinations, including the attacking creature's controller or that controller's permanents.
- [x] Retain an attacking creature's identity while updating its destination, with no undeclared new attacker or replayed attack event.
- [x] Verify redirection timing, changed recipients, short-Library ordering, and reconnects during the private sequence through the command/view seam.

## Comments

Implemented on 2026-10-05 through the agreed Match command/participant-view and
browser-control seams.

Completed Omnitool private inspection, optional artifact retrieval/reveal and
random bottom placement, plus Signpost flash, blue mana and legal destination
reselection. Browser reconnect checks verify private inspection and public reveal
without exposing unrelated Hand cards. Attack identity and events are preserved.

See `docs/rules-automation.md` for behavior and staged coverage. Verification and
review are recorded in `../review-21-25.md`.
