---
status: accepted
---

# Shared Battlefield layout is presentation state

Partly superseded by [ADR-0017](0017-automatic-battlefield-groups.md): the interactive rules UI derives automatic groups instead of using free placement or persisted spatial positions. Player Areas remain presentation within one Battlefield Zone; the older spatial layout is retained for legacy data.

The Battlefield has one shared visual arrangement for all participants, and a card's position is saved independently from its gameplay state. This lets the spatial tabletop synchronize on drag release without changing card rules behavior. The arrangement has one Player Area per Match Player, without creating separate Battlefield Zones. Cards can be placed freely within an area; when a permanent changes Controller, its position moves to the new Controller's area. Each viewer can see their own area at the bottom and control their local zoom and pan without changing the shared card arrangement.
