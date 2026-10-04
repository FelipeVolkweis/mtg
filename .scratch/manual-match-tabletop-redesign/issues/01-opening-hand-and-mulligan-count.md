# 01: Opening Hand and Mulligan Count

**What to build:** A Match Player can draw an opening Hand of seven cards and take a Mulligan from the live table. A Mulligan returns that player's Hand to their Library, shuffles, draws seven new cards, and increases their Mulligan Count. The count is visible and manually correctable; players handle any bottoming themselves.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] A new Match shows the table immediately with an opening draw action near the local Hand; one action draws seven cards for that Match Player.
- [ ] A Mulligan performs the return, shuffle, seven-card redraw, and count increment as one accepted Match action and revision.
- [ ] Mulligan Count starts at zero, is visible to participants, can be manually corrected, and survives reconnecting to the Match.
- [ ] Only the authorized Match Player can change their private Hand and Library through these actions; opponents still see counts without card identities.
- [ ] No automatic bottoming, reduced hand size, free-mulligan calculation, or bottoming reminder is added.
- [ ] Browser-level behavior and focused Match-action tests cover the flow, privacy, and atomic state change.
