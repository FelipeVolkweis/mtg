# 02: Save and validate private Decklists

**What to build:** Let each Room Participant prepare reusable private Decklists from pasted text, with every entry resolved against the locally imported card pool.

**Blocked by:**

- Card Catalog and Rules-Ready Data #01: Import a local card set
- Multiplayer Magic Tabletop #01: Create private Rooms and join as a guest

**Status:** ready-for-agent

- [ ] A Room Participant can create, edit, and keep multiple Decklists private and reusable between Matches.
- [ ] Text import accepts line-based quantities and canonical card names, with an optional set code and collector number for a specific locally imported Card Printing.
- [ ] An unspecified printing resolves to the designated default among that Card Definition's locally imported printings.
- [ ] A multi-faced card's front-face name is accepted as the canonical Decklist name; a back-face or other Card Name Directory name does not become a Decklist alias.
- [ ] If any entry is unresolved, references an unimported Card Definition, or specifies an unimported printing, the complete Decklist import is rejected without accepting a partial list.
- [ ] A Room Participant can select a saved Decklist and mark ready; the saved list remains unchanged by readiness or later Match play.
- [ ] Behavior tests cover successful import, default and exact printing selection, privacy/reuse, and whole-list rejection for unresolved or out-of-set entries.
