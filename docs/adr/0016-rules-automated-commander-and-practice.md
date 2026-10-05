---
status: accepted
---

# Rules-automated Commander and Solo Practice

Released Commander Matches have two human Match Players and use server-owned legal actions, explicit human Priority passes, typed authored Card Abilities, and persisted payment and resolution choices. The first released pool is the complete mono-U sample; rejecting unsupported cards keeps imported facts separate from verified executable behavior, preserving ADR-0001, ADR-0008, ADR-0014, and ADR-0015.

Solo Practice uses the same rules engine with an inert additional Match Player and a supported mirror Library; only its Priority passes are automatic, and the human handles required practice choices. The Room retains one human participant and replacement consent belongs to current human Match Players.

This supersedes [ADR-0003](0003-manual-first-gameplay.md)'s manual gameplay, [ADR-0011](0011-general-stack-objects.md)'s manual Priority and resolution, and [ADR-0013](0013-solo-practice-matches.md)'s one-player Match model. It also supersedes the two-to-four-player release boundaries in [ADR-0002](0002-private-guest-rooms.md) and [ADR-0007](0007-reusable-room-decklists.md), ADR-0007's manual opening procedures, and ADR-0005's manual-play availability policy. Legacy manual active Matches and saved Decklists remain persisted; a legacy Match requires unanimous human consent for replacement instead of being converted into an unverified rules state.
