---
status: accepted
---

# The server runs as a single instance

Some server state lives only in the memory of the one server process; PostgreSQL holds the rest. The in-memory state is:

- **Connections.** The Room gateway's sockets and the Room members they belong to, and `RoomService`'s connected participants per Room. Presence (`connected` in a Room view) and replacement consent ([ADR-0008](0008-persisted-reconnectable-sessions.md): every human Match Player confirms while connected) read them.
- **Broadcast bookkeeping.** The revision and presence each Room's members last received. The expiry timer sends views again only to a Room whose revision or presence changed since then, or that closed or expired.
- **Rate limits.** Sign-in and registration attempts per client IP, and failed sign-ins per IP and username with their temporary lockout ([ADR-0019](0019-user-accounts-and-deck-catalog.md)).

So the server runs as exactly one instance. A second instance behind a load balancer would show players as disconnected who are connected to the other instance, refuse replacement consent, never send views for the other instance's commands, and multiply the rate limits. A restart forgets all of it: every socket reconnects, earlier replacement consent is dropped at startup (`RoomService.onModuleInit`), and rate limits start over.

Running more than one instance would first need shared connection presence, cross-instance broadcasts (for example PostgreSQL `LISTEN`/`NOTIFY`) and shared rate limits.
