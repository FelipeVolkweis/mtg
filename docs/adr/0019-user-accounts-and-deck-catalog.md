---
status: accepted
---

# User accounts own a Deck Catalog

Players sign in as Users, and each User keeps a private Deck Catalog that is independent of any Room. This replaces guest identities ([ADR-0002](0002-private-guest-rooms.md)) and Room-owned Decklists ([ADR-0007](0007-reusable-room-decklists.md)): a guest had to rebuild every deck in every Room, and their Decklists expired with it.

**Sign-in.** A User creates an account with a username and password; no external identity provider or configuration is needed. Usernames are unique regardless of case (3–32 letters, digits, dots, dashes or underscores) and are the User's name. Passwords (8–200 characters) are stored only as salted scrypt hashes. A wrong username and a wrong password get the same answer in the same time, and ten failed sign-ins lock a username for 15 minutes. There is no password reset: it would need email delivery, and an operator can replace a forgotten password's hash in the database. Sessions are random tokens kept as SHA-256 hashes in PostgreSQL and carried by an httpOnly, SameSite=Lax cookie, marked Secure behind HTTPS; the WebSocket authenticates from the same cookie on upgrade and refuses cross-origin upgrades.

**Rooms.** Joining a Room requires a signed-in User. A Room Participant belongs to one User, keeps that User's name (made unique within the Room) and is found again by User, which replaces the guest credential and name-based recovery. Rooms stored before this decision (snapshot version below 7) are deleted at startup because their guests have no User.

**Deck Catalog.** A Deck belongs to one User and one Format: Commander, Standard, Pioneer, Modern, Legacy, Vintage or Pauper. Format construction rules are reported as issues but do not block saving: Commander requires a commander, exactly 100 cards, singleton and Color Identity; the constructed formats require at least 60 cards and at most four copies of a non-basic card. Card legality lists (bans, restrictions, rotation) are not modeled. Only Commander Decks without issues can be used in a Match ([ADR-0016](0016-rules-automated-commander-and-practice.md) is unchanged); the commander is part of the Deck.

**Module ownership** ([ADR-0009](0009-modular-monolith.md)). User owns users, identities and sessions; Deck owns Decks and format rules. Room keeps a copy of each participant's selected Deck, refreshed when they mark ready and when a Match starts, so a Match never reads another module's storage.
