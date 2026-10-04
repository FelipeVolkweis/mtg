# 05: Start Manual Matches from released JSON

**What to build:** Players can start a Manual Match with any imported card, including definitions still marked `unimplemented`. The Match uses released Card Definitions and Card Printings for its card identity and images, while Room and Match state continue to persist normally. Deployment no longer needs to synchronize a second persistent catalog.

**Blocked by:** 04: Serve catalog and Decklists from released JSON.

**Status:** ready-for-agent

- [ ] Starting a Manual Match from a valid Decklist creates Card Instances with the expected Card Definition and exact or default printing, regardless of the definition's automation status.
- [ ] Match creation and card display use the released JSON without a PostgreSQL catalog row or live Scryfall lookup; Room and Match persistence continue to work.
- [ ] PostgreSQL catalog storage is removed as a runtime source of truth, and setup/release guidance explains that reviewed catalog JSON ships with the application revision.
- [ ] The high-level acceptance seam starts a Manual Match using the fixture-produced catalog and verifies card identity and artwork.
- [ ] Rules-Automated Matches are not made playable by this ticket; imported keywords and placeholders are not presented as implemented behavior.
