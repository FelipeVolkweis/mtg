# Architecture decisions

Read the ADRs relevant to the task and follow their current controlling decisions. “Partial” marks an ADR whose accepted core remains while a later ADR controls part of its scope.

Reviewed against repository code and specs on 2026-10-05. This index tracks decisions, not feature completion: catalog modeling capacity is broader than executable rules coverage. The runtime model is limited to supported capacity once proposed ADR-0018 is accepted.

| ADR | State | Review finding / controlling decision |
| --- | --- | --- |
| [0001 — Server authority](0001-server-authoritative-match-state.md) | Accepted | Server revisions and private projections remain; gameplay permissions follow 0016. |
| [0002 — Private guests](0002-private-guest-rooms.md) | Accepted | Invitation/name recovery remains; Room capacity is four; 0016 controls Match formats. |
| [0004 — Local catalog](0004-local-card-catalog.md) | Accepted | Imports provide local game data; play does not require Scryfall queries. |
| [0005 — Catalog and coverage](0005-full-catalog-staged-rules-coverage.md) | Accepted | Catalog availability remains separate from rules support; 0014 and 0015 define current records and identity, while 0016 defines released support. Proposed 0018 limits the runtime model to supported capacity. |
| [0006 — Card identities](0006-card-identity-printing-instance.md) | Accepted, clarified by 0015 | Definition/Printing/Instance/Object separation remains; Oracle identity joins Definitions. |
| [0007 — Reusable Decklists](0007-reusable-room-decklists.md) | Accepted | Private saved lists persist across Matches; 0016 defines current Match setup. |
| [0008 — Persisted sessions](0008-persisted-reconnectable-sessions.md) | Accepted | Snapshots, expiry, and replacement consent for human Match Players remain. |
| [0009 — Modular monolith](0009-modular-monolith.md) | Accepted | Room, Match, and Catalog boundaries remain in one application. |
| [0010 — Battlefield layout](0010-shared-battlefield-layout.md) | Partial | One Battlefield and presentation separation remain; 0017 replaces free placement in the rules UI. Spatial data remains for legacy compatibility until proposed 0018 removes it. |
| [0011 — General Stack objects](0011-general-stack-objects.md) | Accepted | Spell and Ability Game Objects remain distinct Stack objects. |
| [0012 — Application stack](0012-typescript-react-nestjs-postgresql.md) | Accepted | React/Vite, NestJS, native WebSocket, PostgreSQL, and Compose remain; 0014 locates the catalog outside PostgreSQL. |
| [0014 — Versioned catalog](0014-versioned-card-catalog-records.md) | Accepted | Reviewed JSON and imported/authored ownership remain; structured abilities determine supported behavior. |
| [0015 — Oracle identity](0015-oracle-identity-for-card-definitions.md) | Accepted | Oracle IDs join printings; missing Oracle IDs require explicit mapping. |
| [0016 — Automated Commander](0016-rules-automated-commander-and-practice.md) | Accepted | Supported Decklists, explicit human Priority, persisted choices, and mirror Solo Practice are current policy. |
| [0017 — Automatic groups](0017-automatic-battlefield-groups.md) | Accepted | Current types drive groups; attachments follow hosts and layout does not affect rules. |
| [0018 — Supported runtime capacity](0018-runtime-model-carries-supported-capacity.md) | Proposed | The catalog keeps full form modeling; the runtime model drops unsupported and manual-mode fields. Accepted when the card model refactor ships with runtime milestone M1. |

## Verification sources

- Room scope, guest recovery, replacement consent, revisions, and expiry: [Room service](../../src/server/room/room.service.ts).
- Snapshot transactions: [Database](../../src/server/storage/database.ts); consent recovery: [recovery tests](../../tests/recovery.spec.ts).
- Commander setup, legacy rejection, and Practice Opponent: [Match service](../../src/server/match/match.service.ts), [Commander validation](../../src/server/match/commander.ts), and [rules spec](https://github.com/FelipeVolkweis/mtg/issues/4).
- Identity and supported compositions: [shared model](../../src/shared/model.ts), [rules model](../../src/shared/rules.ts), and [Game Object lifecycle](../../src/server/match/game-objects.ts).
- Catalog release and import policy: [catalog files](../../src/server/catalog/catalog-files.ts), [import CLI](../../src/server/catalog/import-cli.ts), and [catalog spec](https://github.com/FelipeVolkweis/mtg/issues/7).
- Application boundaries and transport: [app modules](../../src/server/app.module.ts), [server bootstrap](../../src/server/main.ts), [dependencies](../../package.json), and [Compose](../../compose.yaml).
- Automatic layout: [rules presentation](../../src/client/rules-presentation.ts) and [Rules Board](../../src/client/RulesBoard.tsx).
