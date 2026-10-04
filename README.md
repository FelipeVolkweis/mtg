# Magic Tabletop

An invitation-only browser tabletop for goldfishing a Decklist or playing with two to four guest players. Save private Decklists, start successive Manual Matches, and synchronize cards, life, turn markers, Counters, tokens, Stack abilities, and outcomes. PostgreSQL retains the current Room and Match snapshot; each browser receives only its permitted view.

## Run locally

Requires Node.js 24 and Docker Compose.

```sh
npm ci
npm run catalog:import -- fdn
npm run typecheck
npm run build
docker compose up -d db
npm start
```

Open [localhost:3000](http://localhost:3000), choose a guest name, and share the Room invitation. The importer writes `catalog/definitions/<canonical-name-slug>-<oracle-id>.json`, `catalog/printings/<printing-id>.json`, `catalog/names.json`, and `catalog/sets.json`. Review and commit those files with the application revision before release. Import another set with the same command to grow the available pool. The importer also populates the independent full Card Name Directory from Scryfall's compressed bulk data and current name index; allow time for that download. Every fetched page and card must validate before the released catalog is replaced. An unchanged re-import produces no catalog diff.

Run `npm run catalog:import -- SET` in the checkout whenever you want to add a set; for example, `npm run catalog:import -- fdn`. Saving a Decklist only reads the JSON already in `catalog/`. It never runs the importer or requests cards from Scryfall. A card that has not been imported is rejected when the Decklist is saved.

Definitions start with `automationStatus: "unimplemented"` and `abilities: []`. Card authors can add structured primitive references to `abilities`; only a reviewer should set `automationStatus` to `implemented` after checking complete behavior. Imported keywords are source facts and do not imply automation. Query `/api/catalog/cards?status=unimplemented` to find work awaiting review. If a layout lacks a card-level Oracle ID, add its printing ID and chosen stable UUID to `catalog/identity-map.json` before importing; the importer fails without that explicit mapping. Set `CATALOG_ROOT` to a separate catalog directory for isolated imports or tests.

For development, run `npm run dev` and `npm run dev:client` in separate terminals; open Vite's printed URL. Configure `DATABASE_URL`, `PORT`, and `ROOM_EXPIRY_DAYS` in the shell. `.env.example` documents defaults; Docker Compose reads `.env` for its password and expiry settings. Node does not load `.env` automatically.

## Container deployment

```sh
docker compose up --build -d
```

Import and review sets in the checkout before building the image; the image includes that revision's catalog JSON. After importing more sets into a running Compose checkout, run `docker compose up -d --build app` so the app serves the new catalog. The application serves its built React assets and WebSocket endpoint on port 3000. PostgreSQL retains Room and Match state only and lives in a persistent Compose volume. Set `POSTGRES_PASSWORD` before starting a fresh deployment and provide HTTPS with a reverse proxy when using it outside localhost. Run one application process; connection presence and rematch confirmations belong to that process, while PostgreSQL transactions serialize Room changes and Match revisions. Existing persisted Rooms and Decklists with earlier random Card Definition IDs need a separate migration before adopting this catalog.

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

Tests use the real browser, NestJS transport, importer CLI, and PostgreSQL. They create a temporary catalog root and dedicated databases ending in `_test`, seeded from a local provider fixture. They do not call live Scryfall, edit the reviewed catalog, or use the development Room database. Set `TEST_DATABASE_URL` to a dedicated test database on a role allowed to create the additional recovery and expiry test databases. Restart and expiry checks use isolated application processes. `npm test` builds production assets before starting the acceptance server.

## Scope

This implements the six [Manual Tabletop tickets](.scratch/multiplayer-manual-tabletop/spec.md) and the [Git-Versioned Card Catalog](.scratch/versioned-card-catalog/spec.md). It also stores the extended manual object state described there: face-down state, choices, Casting Records, attachments, Object Links, immutable copy values, meld, special areas, opening-hand records, and Sticker Sheet/placement references. The remaining [Card Catalog and Data work](.scratch/card-catalog-data/spec.md)—rules execution, full alternative-characteristic modeling, predefined token and sticker catalogs, and rules-derived data—is a separate effort. The importer retains selected current Oracle characteristics, faces, rules text, keywords, and artwork references; it does not infer executable card behavior. Card images load from stored artwork URLs and do not trigger card API lookups.

The authoritative protocol is native WebSocket at `/ws`. Authenticate with `{ event: "authenticate", data: { invite, credential } }`, then submit `{ event: "command", data: { requestId, command } }`. Match commands include the Match ID and revision; stale, unauthorized, and invalid commands return `rejected` with the latest permitted view. Accepted commands return `view` and broadcast a fresh projection to all Room participants. There is no action replay log or completed-Match archive.
