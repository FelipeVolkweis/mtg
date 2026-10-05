# 14: Attach Equipment and resolve living weapon

**What to build:** Let players equip creatures and resolve Nettlecyst's token creation, Attachment, and count-based bonus.

**Blocked by:** 08: Collect triggers and create tokens; 09: Calculate continuous characteristics and Counters.

**Status:** ready-for-agent

- [x] Model legal Attachments separately from Object Links and express equip through reusable targets, costs, and timing restrictions.
- [x] Create the living-weapon Germ with its full specified characteristics and attach Nettlecyst in the required instruction order.
- [x] Support attached-creature continuous bonuses and artifact-or-enchantment counts without double-counting an object with both types.
- [x] Author complete Nettlecyst behavior and Adaptive Omnitool's equip and attached bonus; Omnitool remains unimplemented until its attack ability is complete.
- [x] Update effective characteristics and attachment relationships when a source or recipient changes Zones.
- [x] Apply state-based checks after the resolving sequence so living weapon does not incorrectly remove its token before attachment.
- [x] Verify equip controls, illegal targets, count changes, source removal, and resulting public card views through the command/view seam.

## Comments

Implemented on 2026-10-04 through the agreed command/player-view seam.

Implemented sorcery-timed equip, legal Attachments, black Phyrexian Germ creation followed by Attachment, and live union-count bonuses. Nettlecyst is complete. Omnitool has equip and its bonus while remaining unimplemented until its attack ability is delivered in ticket 22.

Validation: typechecking passed; the final full suite passed all 109 acceptance
tests, including seven rules browser tests. Standards review: two duplication
findings fixed, no remaining findings. Spec review: no findings. See
[`review-11-15.md`](../review-11-15.md) and `docs/rules-automation.md`.
