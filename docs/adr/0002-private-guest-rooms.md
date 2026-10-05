---
status: accepted
---

# Private guest rooms for small games

The first version uses invitation-only rooms with guest names, originally supported two to four players per Match, and lets participants start successive matches in the same room. Anyone with the invitation link can join while a seat is available. Participants have equal room permissions; there is no host role initially. Room Participant names are unique within a Room. A participant who joins after a match starts waits for the next match rather than joining the active match. A browser credential supports same-participant reconnect; if it is lost, the participant can reclaim the Room Participant using the unique Room name and invitation link. This is a convenience check rather than strong identity proof: anyone holding the link and knowing the name can reclaim the identity and access its private Decklists and participant-specific Match view. The trade-off is accepted initially. The invitation link remains valid until Room closure or expiry; link rotation is not required initially.

The guest identity and invitation policy remains accepted. [ADR-0016](0016-rules-automated-commander-and-practice.md) narrows released gameplay to two human Match Players or one human in Solo Practice; a Room still holds up to four Room Participants.
