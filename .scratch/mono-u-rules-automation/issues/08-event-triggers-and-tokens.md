# 08: Collect triggers and create tokens

**What to build:** Automatically create and order triggered abilities and resolve shared token-creation effects for the first artifact synergies.

**Blocked by:** 06: Pay activated costs and resolve draw abilities.

**Status:** ready-for-agent

- [x] Produce semantic events with the source, affected objects, relevant controller relationships, and pre-change information required by supported triggers.
- [x] Recognize entering, casting, and Battlefield-to-Graveyard events without conflating returning to Hand with dying.
- [x] Collect waiting triggers and allow the appropriate players to order simultaneous triggers at rules-defined checkpoints.
- [x] Resolve reusable Thopter and Myr token descriptors with correct characteristics, ownership/control, and no Card Instance.
- [x] Author Ichor Wellspring, Vedalken Archmage, Sai's artifact-cast and sacrifice/draw abilities, and Foundry of the Consuls.
- [x] Recognize triggers that happen during payment or resolution but place them on the Stack only at the appropriate opportunity.
- [x] Verify trigger order, source independence, trigger counts, tokens, private draw results, and persisted trigger-order choices through the command/view seam.
- [x] Keep event context sufficient for future consumers without requiring a full persisted action history.

## Comments

Implemented on 2026-10-04 through the agreed command/player-view seam.

Semantic events collect entering, casting and Battlefield-to-Graveyard triggers with pre-change effective data. Waiting triggers reach the Stack at checkpoints with persisted active-player/nonactive-player ordering. Shared Thopter/Myr descriptors and Ichor Wellspring, Vedalken Archmage, Sai and Foundry behavior are authored. Payment completion and cancellation, private draws and browser reconnect ordering are covered.

Validation: typechecking passed; the full suite passed all 88 acceptance tests,
including five rules browser tests. Standards review: 0 actionable findings.
Spec review: 0 actionable findings, including the payment-cancellation follow-up.
See `docs/rules-automation.md` and the rules acceptance tests.
