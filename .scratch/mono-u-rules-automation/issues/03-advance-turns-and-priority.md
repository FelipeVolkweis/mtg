# 03: Advance turns through explicit Priority passes

**What to build:** Make turn progression, basic turn procedures, and explicit human Priority passes work through shared state and visible player controls.

**Blocked by:** 02: Configure Commander Matches.

**Status:** ready-for-agent

- [ ] Advance active player, phases, and steps through rules rather than arbitrary manual Turn State edits.
- [ ] Perform untapping, required drawing, first-turn draw handling, and ordinary cleanup at their prescribed times.
- [ ] Show whose Priority it is and provide an explicit pass control only to the authorized human Match Player.
- [ ] Advance an empty Stack or end a step only after the required pass sequence; reset passes when a legal intervening action requires it.
- [ ] Handle checkpoints for waiting triggers and state-based actions without granting Priority in steps that do not normally provide it.
- [ ] Expire ordinary mana pools and reset relevant turn markers at the appropriate transitions as those state fields are introduced.
- [ ] Verify ordered server revisions, out-of-turn rejection, private draws, and turn progression through the command/view seam.
