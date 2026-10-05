# Magic Tabletop

An invitation-only browser tabletop for automated Commander Matches with two human players or one human practicing against an inert opponent. Save private Decklists, select a commander, and play with legal actions, explicit Priority, payment choices, combat, and authored card effects. PostgreSQL retains the current Room and Match snapshot; each browser receives only its permitted view.

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

Each implemented Card Ability includes a `description` copied from the matching Oracle Text excerpt, including its costs and restrictions. Card action buttons display that description; mana abilities with multiple color choices identify each choice. Imports preserve these authored descriptions with the structured abilities.

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

Use `quantity Card Name` for the designated default printing, or `quantity Card Name (SET) collector-number` for an exact imported printing. Empty lines and `#` comments are ignored. An unresolved entry rejects the whole list. Select a saved 100-card Decklist, choose an eligible legendary creature as commander, and mark ready. The complete [mono-U sample](sample-decklists/mono-u.md) is supported; every Decklist card must pass automation eligibility. Two ready participants can start a mirror Match, and the sole ready participant can start solo practice.

Drag a playable card from your Hand or Command Zone onto the Battlefield to play a land or begin casting. Click a permanent for its available activated abilities; clicking outside closes the menu. Select legal targets by clicking their cards or player labels, and declare combat by clicking a creature followed by its defender or attack assignment. Confirm the declaration when ready, and explicitly pass Priority with the Pass Priority control. A payment window accepts selected mana sources and nonmana costs; improvise taps selected artifacts for generic payment. Targeting, resolution selections, trigger ordering, and combat use the existing engine procedures, with required choices restored after reconnects.

The match board uses a top-down view with color-coded player sides and an independent Hand tray. Occupied card types group automatically without visible labels or empty zones. Cards resize to fit the available battlefield and Hand space without scrolling. Equivalent same-name copies spread temporarily on the battlefield and remain together while tapped or otherwise changed; clicking outside the spread or pressing Escape collapses them. Differences in current stats, counters, tapped state, or attachments keep copies separate. Hold Alt while hovering a card to inspect its enlarged printing and current state. Card menus expose legal plays, casts, and abilities beside the selected card. Click Graveyard or Exile beside a player's Library to browse its cards; casting permissions still come from the engine. Commanders appear beside the Hand with their Command Zone tax, or a location placeholder while elsewhere. Libraries and other players' Hands remain private. The shared Stack shows resolution order, with Priority and the current phase beneath it; room information stays behind the Room drawer. A card changing Zones gets a fresh Game Object identity while retaining its Card Instance, Owner, and commander designation.

Solo practice creates an inert Match Player with a supported mirror Library. It automatically passes Priority and makes no proactive casts or activations; the human handles its required choices. Spectators can observe permitted public state.

The Room holds four participant identities. A late guest waits for the next Match and observes public state. Guest credentials stay in browser storage; the invitation plus an existing unique Room name can reclaim that identity if the credential is lost. This intentionally permits someone who knows both to recover the same private information. Name recovery replaces the previous credential.

A new Match replaces the active one only after every current human Match Player is connected and confirms the current request. Disconnecting revokes that player's consent; changing readiness or a Decklist cancels the proposal. Rooms expire after 30 days of meaningful activity by default; snapshots, connections, and keepalives do not extend expiry. Any participant can close a Room.

## Checks

```sh
npm run typecheck
npx playwright install chromium
npx playwright test tests/rules.spec.ts tests/rules-ui.spec.ts
npm test
```

Tests use the real browser, NestJS transport, importer CLI, and PostgreSQL. They create a temporary catalog root and dedicated databases ending in `_test`, seeded from a local provider fixture. They do not call live Scryfall, edit the reviewed catalog, or use the development Room database. Set `TEST_DATABASE_URL` to a dedicated test database on a role allowed to create the additional recovery and expiry test databases. Restart and expiry checks use isolated application processes. `npm test` builds production assets before starting the acceptance server.

## Scope

The [Mono-U Rules Automation issue](https://github.com/FelipeVolkweis/mtg/issues/4) supersedes manual gameplay. Existing Rooms, saved Decklists, and legacy active Matches remain persisted. A legacy Match displays a replacement notice and requires its human players' consent to start an automated Match; arbitrary manual mutation commands are retired.

The [Git-Versioned Card Catalog issue](https://github.com/FelipeVolkweis/mtg/issues/7) records the catalog release policy. Imported facts and keywords do not infer executable behavior. Unsupported Decklists, arbitrary opposing pools, additional formats, and three- or four-human Matches are outside this release. Card images use stored artwork URLs without card API lookups.

The authoritative protocol is native WebSocket at `/ws`. Authenticate with `{ event: "authenticate", data: { invite, credential } }`, then submit `{ event: "command", data: { requestId, command } }`. Match commands include the Match ID and revision; stale, unauthorized, and invalid commands return `rejected` with the latest permitted view. Accepted commands return `view` and broadcast a fresh projection to all Room participants. There is no action replay log or completed-Match archive.
