---
status: accepted
---

# Private guest rooms for small games

Rooms are invitation-only, use guest names, and let participants start successive Matches. A Room holds up to four Room Participants. Anyone with the invitation link can join while a seat is available. Participants have equal Room permissions; there is no host role. Room Participant names are unique within a Room. A participant who joins after a Match starts waits for the next Match rather than joining the active Match. Released Match formats are defined by [ADR-0016](0016-rules-automated-commander-and-practice.md).

A browser credential supports same-participant reconnect. If it is lost, the participant can reclaim the Room Participant using the unique Room name and invitation link. This is a convenience check rather than strong identity proof: anyone holding the link and knowing the name can reclaim the identity and access its private Decklists and participant-specific Match view. The invitation link remains valid until Room closure or expiry; link rotation is not required.
