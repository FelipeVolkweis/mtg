# Magic Tabletop

An invitation-only browser tabletop for goldfishing a Decklist or playing with two to four guest players. Save private Decklists, start successive Manual Matches, and synchronize cards, life, turn markers, Counters, tokens, Stack abilities, and outcomes. PostgreSQL retains the current Room and Match snapshot; each browser receives only its permitted view.

## Run locally

Requires Node.js 24 and Docker Compose.

```sh
npm ci
docker compose up -d db
npm run catalog:import -- fdn
npm run build
npm start
```

Open [localhost:3000](http://localhost:3000), choose a guest name, and share the Room invitation. Import another set with the same command to grow the available card pool. The importer also populates the independent full Card Name Directory from Scryfall's compressed bulk data and current name index; allow time for that download. Every fetched page must succeed before the catalog is committed; re-importing preserves printing defaults and existing identities.

For development, run `npm run dev` and `npm run dev:client` in separate terminals; open Vite's printed URL. Configure `DATABASE_URL`, `PORT`, and `ROOM_EXPIRY_DAYS` in the shell. `.env.example` documents defaults; Docker Compose reads `.env` for its password and expiry settings. Node does not load `.env` automatically.

## Container deployment

```sh
docker compose up --build -d
docker compose exec app node dist/server/catalog/import-cli.js fdn
```

The application serves its built React assets and WebSocket endpoint on port 3000. PostgreSQL data lives in a persistent Compose volume. Set `POSTGRES_PASSWORD` before starting a fresh deployment and provide HTTPS with a reverse proxy when using it outside localhost. Run one application process; connection presence and rematch confirmations belong to that process, while PostgreSQL transactions serialize Room changes and Match revisions.

## Decklists and play

Paste one entry per line. Only locally imported canonical names are eligible; double-faced cards use their front-face name.

```text
4 Island
4 Llanowar Elves
```

Use `quantity Card Name` for the designated default printing, or `quantity Card Name (SET) collector-number` for an exact imported printing. Empty lines and `#` comments are ignored. An unresolved entry rejects the whole list. Select a saved Decklist and mark ready; any participant can start when at least two are ready.

Drag cards between Zones or within the spatial Battlefield; the server commits on release. Select a card to move it to a precise ordered position, change its controller or face, tap it, record choices or casting facts, or use the advanced manual controls. A card changing Zones gets a fresh Game Object identity while retaining its Card Instance and Owner. Saved Decklists are independent of these actions.

Only a private Zone's owner may generally inspect or manipulate it. An ability controller can direct one known object into another player's private Zone by selecting the ability source and recording its manual cost or effect. Face-down inspection permissions are separate from control. Shared markers and card mechanics stay manual; life reaching zero, Counters, and resolving a text-only ability never apply rules or effects automatically.

The Room holds four participant identities. A late guest waits for the next Match and can still manipulate public objects. Guest credentials stay in browser storage; the invitation plus an existing unique Room name can reclaim that identity if the credential is lost. This intentionally permits someone who knows both to recover the same private information. Name recovery replaces the previous credential.

A new Match replaces the active one only after every current Match Player is connected and confirms the current request. Disconnecting revokes that player's consent; changing readiness or a Decklist cancels the proposal. Rooms expire after 30 days of meaningful activity by default; snapshots, connections, and keepalives do not extend expiry. Any participant can close a Room.

## Checks

```sh
npm run typecheck
npx playwright install chromium
npx playwright test tests/tabletop.spec.ts
npm test
```

Tests use the real browser, NestJS transport, importer CLI, and PostgreSQL. They create dedicated databases ending in `_test` and seed them from a local provider fixture. They do not call live Scryfall or use the development Room database. Set `TEST_DATABASE_URL` to a dedicated test database on a role allowed to create the additional recovery and expiry test databases. Restart and expiry checks use isolated application processes. `npm test` builds production assets before starting the acceptance server.

## Scope

This implements the six [Manual Tabletop tickets](.scratch/multiplayer-manual-tabletop/spec.md) and their local-set importer dependency. It also stores the extended manual object state described there: face-down state, choices, Casting Records, attachments, Object Links, immutable copy values, meld, special areas, opening-hand records, and Sticker Sheet/placement references. The remaining [Card Catalog and Data work](.scratch/card-catalog-data/spec.md)—structured abilities/effects, full alternative-characteristic modeling, predefined token and sticker catalogs, and rules-derived data—is a separate effort. The importer retains ordinary printed characteristics, faces, rules text, and artwork references; it does not infer executable card behavior. Card images load from stored artwork URLs and do not trigger card API lookups.

The authoritative protocol is native WebSocket at `/ws`. Authenticate with `{ event: "authenticate", data: { invite, credential } }`, then submit `{ event: "command", data: { requestId, command } }`. Match commands include the Match ID and revision; stale, unauthorized, and invalid commands return `rejected` with the latest permitted view. Accepted commands return `view` and broadcast a fresh projection to all Room participants. There is no action replay log or completed-Match archive.
