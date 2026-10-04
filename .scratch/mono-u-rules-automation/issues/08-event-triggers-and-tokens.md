# 08: Collect triggers and create tokens

**What to build:** Automatically create and order triggered abilities and resolve shared token-creation effects for the first artifact synergies.

**Blocked by:** 06: Pay activated costs and resolve draw abilities.

**Status:** ready-for-agent

- [ ] Produce semantic events with the source, affected objects, relevant controller relationships, and pre-change information required by supported triggers.
- [ ] Recognize entering, casting, and Battlefield-to-Graveyard events without conflating returning to Hand with dying.
- [ ] Collect waiting triggers and allow the appropriate players to order simultaneous triggers at rules-defined checkpoints.
- [ ] Resolve reusable Thopter and Myr token descriptors with correct characteristics, ownership/control, and no Card Instance.
- [ ] Author Ichor Wellspring, Vedalken Archmage, Sai's artifact-cast and sacrifice/draw abilities, and Foundry of the Consuls.
- [ ] Recognize triggers that happen during payment or resolution but place them on the Stack only at the appropriate opportunity.
- [ ] Verify trigger order, source independence, trigger counts, tokens, private draw results, and persisted trigger-order choices through the command/view seam.
- [ ] Keep event context sufficient for future consumers without requiring a full persisted action history.
