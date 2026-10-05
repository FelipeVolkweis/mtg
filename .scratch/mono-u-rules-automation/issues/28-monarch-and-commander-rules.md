# 28: Complete monarch and Commander rules

**What to build:** Make Fall from Favor, monarch behavior, and Commander-specific casting, return, and damage rules work end to end.

**Blocked by:** 10: Compose casting and activation discounts; 13: Resolve destruction, exile, and mass sacrifice; 14: Attach Equipment and resolve living weapon; 18: Apply combat damage and determine outcomes.

**Status:** ready-for-agent

- [x] Author Fall from Favor as an Aura with legal creature targeting, Attachment, entry tap, and monarch acquisition.
- [x] Track the current monarch and implement the associated end-step draw and combat-damage transfer through shared rules behavior.
- [x] Apply its monarch-dependent untap restriction during the enchanted creature controller's untap procedure.
- [x] Apply commander tax to casts from the Command Zone and retain commander designation through every applicable Zone change.
- [x] Provide command-zone return choices with the different rules procedures for Graveyard/Exile versus Hand/Library movement.
- [x] Track combat damage from each commander and apply Commander-specific losses at the correct checkpoint.
- [x] Verify tax with cost reducers, return choices after destruction and bounce, monarch transfer/draw, Aura removal, and effective untap behavior.
- [x] Persist designation, counts, damage, and pending return choices without making Sai or Padeem special engine cases.

## Comments

Implemented on 2026-10-05 through the agreed Match command/participant-view and
browser-control seams.

Completed Aura targeting/Attachment, monarch acquisition/transfer/end-step
draw and untap restrictions. Commanders retain designation across Zones,
receive cast tax after prior casts, offer the appropriate return procedures,
and accumulate combat damage toward losses. Checks cover both owners,
reducers, bounce replay and stale answers, Aura cleanup and persisted choices.

See `docs/rules-automation.md` for behavior. Verification and the independent
Standards/Spec reviews are recorded in `../review-26-30.md`.
