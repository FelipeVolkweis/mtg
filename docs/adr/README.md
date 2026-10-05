# Architecture decisions

Read the rows relevant to the task, then open those ADRs and their superseding decisions. “Partial” means the original decision still has an accepted core; the named later ADR controls the replaced policy. Historical text explains prior choices rather than current requirements.

Reviewed against repository code and specs on 2026-10-05. This index tracks decisions, not feature completion: catalog modeling capacity is broader than executable rules coverage.

| ADR | State | Review finding / controlling decision |
| --- | --- | --- |
| [0001 — Server authority](0001-server-authoritative-match-state.md) | Accepted | Server revisions and private projections remain; gameplay permissions follow 0016. |
| [0002 — Private guests](0002-private-guest-rooms.md) | Partial | Invitation/name recovery remains; 0016 replaces two-to-four-human Match scope. Room capacity remains four. |
| [0003 — Manual-first play](0003-manual-first-gameplay.md) | Superseded by 0016 | Historical manual actions, counters, and turn controls. |
| [0004 — Local catalog](0004-local-card-catalog.md) | Accepted | Imports provide local game data; play does not require Scryfall queries. |
| [0005 — Catalog and coverage](0005-full-catalog-staged-rules-coverage.md) | Partial | Availability/coverage separation remains; 0014 replaces printing-derived characteristics, 0015 name identity, and 0016 manual availability. Detailed modeling guidance is disclosed separately. |
| [0006 — Card identities](0006-card-identity-printing-instance.md) | Accepted, clarified by 0015 | Definition/Printing/Instance/Object separation remains; Oracle identity joins Definitions. |
| [0007 — Reusable Decklists](0007-reusable-room-decklists.md) | Partial | Private saved lists remain; 0016 replaces player-count and manual-opening policy. |
| [0008 — Persisted sessions](0008-persisted-reconnectable-sessions.md) | Accepted | Snapshots, expiry, and unanimous replacement remain; 0016 limits consent to human Match Players. |
| [0009 — Modular monolith](0009-modular-monolith.md) | Accepted | Room, Match, and Catalog boundaries remain in one application. |
| [0010 — Battlefield layout](0010-shared-battlefield-layout.md) | Partial | One Battlefield and presentation separation remain; 0017 replaces free placement in the rules UI. Spatial data remains for legacy compatibility. |
| [0011 — General Stack objects](0011-general-stack-objects.md) | Partial | Spells and abilities remain distinct Objects; 0016 supersedes manual Priority/resolution only. |
| [0012 — Application stack](0012-typescript-react-nestjs-postgresql.md) | Accepted | React/Vite, NestJS, native WebSocket, PostgreSQL, and Compose remain; 0014 locates the catalog outside PostgreSQL. |
| [0013 — Solo Match](0013-solo-practice-matches.md) | Superseded by 0016 | Historical one-seat model; current Solo Practice adds an inert Match Player. |
| [0014 — Versioned catalog](0014-versioned-card-catalog-records.md) | Accepted | Reviewed JSON and imported/authored ownership remain; structured abilities determine supported behavior. |
| [0015 — Oracle identity](0015-oracle-identity-for-card-definitions.md) | Accepted | Oracle IDs join printings; missing Oracle IDs require explicit mapping. |
| [0016 — Automated Commander](0016-rules-automated-commander-and-practice.md) | Accepted | Supported Decklists, explicit human Priority, persisted choices, and mirror Solo Practice are current policy. |
| [0017 — Automatic groups](0017-automatic-battlefield-groups.md) | Accepted | Current types drive groups; attachments follow hosts and layout does not affect rules. |

## Verification sources

- Room scope, guest recovery, replacement consent, revisions, and expiry: [Room service](../../src/server/room/room.service.ts).
- Snapshot transactions: [Database](../../src/server/storage/database.ts); consent recovery: [recovery tests](../../tests/recovery.spec.ts).
- Commander setup, legacy rejection, and Practice Opponent: [Match service](../../src/server/match/match.service.ts), [Commander validation](../../src/server/match/commander.ts), and [rules spec](https://github.com/FelipeVolkweis/mtg/issues/4).
- Identity and supported compositions: [shared model](../../src/shared/model.ts), [rules model](../../src/shared/rules.ts), and [Game Object lifecycle](../../src/server/match/game-objects.ts).
- Catalog release and import policy: [catalog files](../../src/server/catalog/catalog-files.ts), [import CLI](../../src/server/catalog/import-cli.ts), and [catalog spec](https://github.com/FelipeVolkweis/mtg/issues/7).
- Application boundaries and transport: [app modules](../../src/server/app.module.ts), [server bootstrap](../../src/server/main.ts), [dependencies](../../package.json), and [Compose](../../compose.yaml).
- Automatic layout: [rules presentation](../../src/client/rules-presentation.ts) and [Rules Board](../../src/client/RulesBoard.tsx).
