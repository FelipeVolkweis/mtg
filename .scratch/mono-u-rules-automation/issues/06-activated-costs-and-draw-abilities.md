# 06: Pay activated costs and resolve draw abilities

**What to build:** Let players choose and pay activated costs, then resolve draw and mana abilities even when payment removes the source.

**Blocked by:** 05: Choose targets and resolve counterspells.

**Status:** ready-for-agent

- [ ] Compose typed mana, tap, sacrifice, discard, and life costs with reusable object selections and semantic draw effects.
- [ ] Preserve the distinction between tap-symbol costs and tapping selected untapped objects, including applicable creature restrictions.
- [ ] Create Ability Game Objects with sufficient source information to resolve after their source is sacrificed or changes Zones.
- [ ] Support the applicable activations of Mind Stone, Hedron Archive, Silver Myr, Palladium Myr, Ornithopter of Paradise, Arcane Signet, and War Room.
- [ ] Support cycling from Hand for Lonely Sandbar and Remote Isle; their tapped-entry behavior remains required before their definitions become fully implemented.
- [ ] Calculate War Room's life payment and Arcane Signet's permitted colors from recorded commander Color Identity, wherever the commander currently is.
- [ ] Validate complete costs and legal payment order; reversed illegal actions must not create effects, triggers, or duplicated resources.
- [ ] Verify shared payment controls, private draws, source-independent resolution, and resuming a pending activation through the command/view seam.
