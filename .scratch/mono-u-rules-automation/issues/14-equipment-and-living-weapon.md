# 14: Attach Equipment and resolve living weapon

**What to build:** Let players equip creatures and resolve Nettlecyst's token creation, Attachment, and count-based bonus.

**Blocked by:** 08: Collect triggers and create tokens; 09: Calculate continuous characteristics and Counters.

**Status:** ready-for-agent

- [ ] Model legal Attachments separately from Object Links and express equip through reusable targets, costs, and timing restrictions.
- [ ] Create the living-weapon Germ with its full specified characteristics and attach Nettlecyst in the required instruction order.
- [ ] Support attached-creature continuous bonuses and artifact-or-enchantment counts without double-counting an object with both types.
- [ ] Author complete Nettlecyst behavior and Adaptive Omnitool's equip and attached bonus; Omnitool remains unimplemented until its attack ability is complete.
- [ ] Update effective characteristics and attachment relationships when a source or recipient changes Zones.
- [ ] Apply state-based checks after the resolving sequence so living weapon does not incorrectly remove its token before attachment.
- [ ] Verify equip controls, illegal targets, count changes, source removal, and resulting public card views through the command/view seam.
