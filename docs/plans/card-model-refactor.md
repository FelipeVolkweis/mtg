# Card Model Refactor

## 1. Purpose

Shrink the card and game-object model to what the catalog and the rules engine actually use.

This plan covers two layers:

- **Catalog definitions**: `CardDefinition` and `CardAbility` in `src/shared/model.ts`, the zod schema in `src/server/catalog/catalog-files.ts`, and the 783 files in `catalog/definitions/`.
- **Runtime model**: `GameObject` and `MatchState` in `src/shared/model.ts`, persisted inside room snapshots.

It is carried out in runtime milestone M1 ([rules-engine-refactor.md](rules-engine-refactor.md) §63), as **one migration together with the DSL redesign** ([dsl-redesign.md](dsl-redesign.md) §9). Both rewrite every definition file, so they ship as one catalog version.

The governing decision is [ADR-0018](../adr/0018-runtime-model-carries-supported-capacity.md): the catalog may model the full card pool's forms, and the runtime model carries only what supported cards use.

---

# 2. Evidence

Counts are from the repository at the time of writing.

## 2.1 Catalog definitions

All 783 definitions have exactly one component (782 `normal`, 1 `saga`). In every file:

| Stored field | Always equal to |
|---|---|
| `canonicalName` | `components[0].name` |
| top-level `manaValue` | `components[0].manaValue` |
| top-level `keywords` | union of component `keywords` |
| `oracleText` | component `rulesText` joined |
| component `typeLine` | `supertypes` + `types` + `—` + `subtypes` |

Other findings:

- `form` is an untyped `string`. The importer accepts a fixed set of eight Scryfall layouts (`supportedLayouts` in `catalog.service.ts`) and rejects others.
- 14 abilities set `keyword` both on the ability and inside `rules`.
- `CardAbility.trigger`, `costs`, `conditions` and `effects`, with their types `AbilityPrimitive`, `AbilityValue` and `AbilityCost`, never appear in data. The catalog zod schema (`catalog-files.ts:41-82`) still accepts them.
- `origin: "rules"` never appears. Every ability is `printed`.
- Imported and authored fields share one flat object, although the importer already treats them differently: `catalog.service.ts:96-160` overwrites Scryfall fields and preserves `automationStatus` and `abilities` from the existing file (ADR-0014).

## 2.2 Runtime model

Manual Matches are legacy: `match.service.ts:272` rejects them and requires replacement with an automated Commander Match. New matches always set `mode: "rules"` (`match.service.ts:55`, `:186`).

| Field | Writers outside initialization and copying | Readers |
|---|---|---|
| `MatchState.mode`, optional `MatchState.rules` | none (always `"rules"` with `rules` present) | `match.rules &&` guards across the engine |
| `objectPatchSchema` | none (manual-mode edit schema; only its types are reused) | — |
| `GameObject.designations` | none | client display |
| `GameObject.choices` | none | — |
| `GameObject.stickerPlacements`, `MatchState.stickerSheets` | none | view pass-through |
| `MatchState.diceRolls`, `openingHandActions` | none | view pass-through |
| `MatchState.layout`, `position` action | `moveObject` assigns initial positions; the client never sends `position` (ADR-0017) | view pass-through |
| `GameObject.meldParts` | none | view (`melded` flag) |
| `GameObject.protectorId` | none | combat, client |
| `GameObject.faceDown` | none | visibility, view, client |
| `status.flipped` | none | client |
| `status.phasedOut` | none | 5 checks in engine and combat, client |
| `GameObject.copiableValuesId`, `MatchState.copiableValues` | none (no copy effect exists; Duplicant uses linked characteristics) | view |
| `GameObject.cannotBeCountered` | only a test (`tests/rules.spec.ts:632`) | counter resolution |
| object kinds `dungeon`, `plane`, `phenomenon`, `conspiracy`, `attraction`, `contraption` | none | — |
| zone kinds `supplementary`, `special` | none | — |

Ownership is stored three ways: `CardInstance.ownerId`, an optional `GameObject.ownerId` (set only on ability and token objects: `triggers.ts:56`, `rules-engine.ts:559`, `:774`, `:894`), and `controllerId` as a last resort. The chain `instances[object.cardInstanceIds[0]]?.ownerId ?? object.ownerId ?? object.controllerId` appears 14 times.

X is stored twice on spells: `variables` (`rules-engine.ts:915`) and `casting.chosenX` (`:918`). The casting record keeps `modes`, `alternativeCost` and `additionalCosts` as free text.

---

# 3. Catalog definition, version 2

## 3.1 Shape

```ts
interface CardDefinitionFile {
  catalogVersion: 2;
  id: string;                    // Oracle identity (ADR-0015)
  imported: {
    form: CardForm;
    components: ComponentCharacteristics[];
    colorIdentity: Color[];
    defaultPrintingId: string;
  };
  authored: {
    automationStatus: "unimplemented" | "implemented";
    abilities: Ability[];        // DSL v2 (dsl-redesign.md §4)
  };
}

type CardForm =                 // the layouts the importer accepts (catalog.service.ts supportedLayouts)
  | "normal" | "saga" | "transform" | "modal_dfc"
  | "split" | "reversible_card" | "room" | "flip";

interface ComponentCharacteristics {
  name: string;
  manaCost?: string;
  manaValue?: number;            // per component, as imported
  colors: Color[];
  colorIndicator?: Color[];
  supertypes: string[];
  types: string[];
  subtypes: string[];
  keywords: string[];            // imported fact; not rules support (ADR-0005)
  rulesText: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  defense?: string;
}
```

The `CardForm` list mirrors `supportedLayouts` in `catalog.service.ts`. Implementation derives the type from that constant, not from this document.

The importer parses `supertypes`, `types` and `subtypes` from Scryfall's type line (`catalog.service.ts`, the parser before `supportedLayouts`). It keeps doing so. Only the stored copy of the type line is dropped.

## 3.2 Ownership

- A set import may write only `imported`. It never touches `authored`. This is the behavior `catalog.service.ts` already has, made visible in the file.
- Reviewers own `authored`. Diffs to `authored` are rules changes. Diffs to `imported` are data refreshes.

## 3.3 Derived values

One pure function in `src/server/catalog/` derives these values when the catalog is read. They are never stored:

| Value | Rule |
|---|---|
| canonical name | front face name. Split cards join face names with ` // ` (ADR-0015 keeps this as the Decklist label) |
| mana value | per the Comprehensive Rules for each form: `split` and `room` combine both halves; `transform`, `modal_dfc` and `flip` use the front face (or main half); `reversible_card` faces are independent and have no combined value; `normal` and `saga` have one component. The implementation cites the CR rule for each case. |
| keywords | union over components |
| Oracle text | component `rulesText` joined, with ` // ` between faces |
| type line | `supertypes types — subtypes` per component |

`CardDefinition` (the in-memory type the engine uses) keeps these as fields. Only the files stop storing them.

## 3.4 Abilities

- `description` stays (display text for an ability).
- The ability-level `keyword` and `applicableZone` fields are dropped. DSL v2 has `kind: "keyword"` and `activeFrom`.
- `origin` keeps `"printed" | "granted"`. `"rules"` is dropped.
- `AbilityPrimitive`, `AbilityValue`, `AbilityCost` and the primitive branches of the catalog zod schema are deleted.

---

# 4. Runtime model

## 4.1 Removed

Each field listed in §2.2 as having no writer is removed from `src/shared/model.ts`, together with the code that only initializes, copies or projects it:

- `MatchState.mode`. `MatchState.rules` becomes required, and the `match.rules &&` guards go away.
- `objectPatchSchema` and `ObjectPatch`. The types it lent to `GameObject` move next to `GameObject`.
- `GameObject.designations`, `choices`, `stickerPlacements`, `meldParts`, `protectorId`, `faceDown`, `copiableValuesId`, `cannotBeCountered`.
- `status.flipped` and `status.phasedOut`, leaving `status.tapped`. Keep `status` as an object so later statuses don't change the shape again.
- `MatchState.diceRolls`, `openingHandActions`, `stickerSheets`, `copiableValues`, `layout`, and the `position` match action.
- Object kinds other than `card`, `token` and `ability`. Zone kinds `supplementary` and `special`.

Client code that reads these fields (`RulesBoard.tsx` status badges, `rules-presentation.ts` `designations`/`faceDown`/`protector`) is removed with them.

## 4.2 Changed

- **Owner.** `GameObject.ownerId` becomes required.
  - `gameObject()` takes the owner as a parameter.
  - `moveObject()` carries it to the fresh object (`src/server/match/game-objects.ts`).
  - Cards take it from their Card Instance, and tokens and abilities from the creating effect.
  - `RulesEngine.owner()` returns `object.ownerId`, and the 14 fallback chains are deleted.
- **Stack choices.** One record holds what was chosen while proposing a spell or ability:

  ```ts
  interface ProposalRecord {
    sourceZone?: ZoneKind;          // spells only (casting record)
    variables: Record<string, number>;  // X and other chosen values
    modes: string[];                // DSL v2 mode ids
    optionalCosts: string[];        // paid optional cost ids, e.g. "kicker"
    alternativeCost?: string;       // alternative cost id
    manaSpent: ManaType[];
  }
  ```

  It replaces `GameObject.variables` and `GameObject.casting` (spells), including the duplicated `chosenX`. It carries over from stack to battlefield as `casting` does today (`moveObject`), because permanents can ask how they were cast.
- **Ability objects.** Stack abilities currently get fake characteristics (`typeLine: "Ability"`, `rules-engine.ts:934`). Keep the shape for now. Stack Resolution Runtime work (runtime plan Phase 7) decides whether ability objects keep characteristics.

## 4.3 Kept

- The Definition / Printing / Instance / Object separation (ADR-0006).
- Per-object `characteristics` and `components` snapshots: running matches stay independent of later catalog edits.
- `currentFace`, used with `components` and artwork selection.
- `links` (Duplicant's linked exile), `attachmentTo`, `counters`, `sourceObjectId`, `sourceAbilityId`, `resolution`.
- `artwork` on the object (set from the printing at match start, `match.service.ts:127`). Tokens have no printing, so the object copy stays the single source.

## 4.4 Re-adding a removed field

A removed field returns only together with:

1. a supported card whose rules need it;
2. a rules test that sets it through gameplay, not through `force` helpers;
3. a projection decision (who sees it, in `match-view.ts` and `object-visibility.ts`).

---

# 5. Persistence

Room snapshots are unversioned `jsonb` (`src/server/storage/database.ts:14`). Rooms expire after `ROOM_EXPIRY_DAYS`, 30 by default (`room.service.ts:30`).

- Add `snapshotVersion` to `RoomState`.
- Add a pure `upgradeRoom(room)` applied wherever `RoomService` loads a room (`room.service.ts:128-132`). For version 1 snapshots it:
  - removes the fields listed in §4.1;
  - backfills `GameObject.ownerId` from Card Instances, then from the existing optional field;
  - folds `variables` and `casting` into the proposal record;
  - stamps `snapshotVersion: 2`.
- Write the upgraded document back on the next save, as the service already does.
- Delete `upgradeRoom` and its version 1 handling after one expiry period has passed since deploy.

The existing startup SQL migration (`room.service.ts:43`) shows the alternative. A TypeScript upgrade function is preferred because the changes are structural and testable in isolation.

---

# 6. Migration

The script is shared with the DSL redesign (dsl-redesign.md §9):

1. Read each version 1 definition.
2. Check that the stored derived fields (§3.3) equal the derivation function's output. Stop on any mismatch: it is either a derivation bug or bad data, and both need a person.
3. Write `catalogVersion: 2` with `imported` and `authored` sections, components without `typeLine`, and abilities in DSL v2.
4. Report per-card diffs.

The importer (`catalog.service.ts`) and the catalog reader (`catalog-files.ts`) switch to version 2 in the same change.

---

# 7. Tests

Added to the test plan (rules-test-plan.md, M1 Phase 2):

- **Derivation:**
  - For all current definitions, the derivation function reproduces the stored `canonicalName`, `manaValue`, `keywords`, `oracleText` and `typeLine`.
  - One hand-written fixture per accepted multi-face layout checks the form-specific rules.
- **Import ownership:** re-importing a set leaves `authored` byte-identical.
- **Snapshot upgrade:** fixtures of version 1 rooms (mid-casting, mid-resolution, with tokens and stack abilities) upgrade to valid version 2 rooms, and the characterization scenarios continue from them.
- **Owner:** every object created by setup, casting, token creation, triggers and zone changes has `ownerId` set. No fallback chain remains (lint-style grep test or code review).
- `cannotBeCountered`: the test at `tests/rules.spec.ts:632` uses a `force` helper until DSL v2 provides a "can't be countered" grant, then a real card definition.

---

# 8. Field inventory

Every current field, and what happens to it.

**`CardDefinition`:** `id` kept · `canonicalName` derived · `defaultPrintingId` kept (imported) · `form` kept as enum (imported) · `colorIdentity` kept (imported) · `components` kept (imported) · `oracleText` derived · `keywords` derived · `manaValue` derived · `automationStatus` kept (authored) · `abilities` kept as DSL v2 (authored).

**`CardAbility`:** `id`, `description`, `kind` kept · `origin` kept without `"rules"` · `rules` becomes the DSL v2 ability · `applicableZone` becomes `activeFrom` · `keyword` becomes `kind: "keyword"` · `trigger`, `costs`, `conditions`, `effects` removed.

**`Characteristics`:** all kept except `typeLine` (derived).

**`GameObject`:** `id`, `kind` (narrowed), `zoneId`, `cardInstanceIds`, `controllerId`, `characteristics`, `components`, `artwork`, `currentFace`, `status` (tapped only), `counters`, `attachmentTo`, `links`, `sourceObjectId`, `sourceAbilityId`, `resolution` kept · `ownerId` required · `variables` + `casting` become the proposal record · `designations`, `faceDown`, `protectorId`, `choices`, `copiableValuesId`, `stickerPlacements`, `meldParts`, `cannotBeCountered` removed.

**`MatchState`:** `id`, `revision`, `players`, `instances`, `objects`, `zones`, `turn`, `outcome`, `priority` kept · `rules` required · `mode`, `layout`, `openingHandActions`, `copiableValues`, `diceRolls`, `stickerSheets` removed.

---

# 9. Out of scope

- Supporting multi-face cards at runtime. The catalog keeps modeling them; runtime fields come back under §4.4.
- Changing the Decklist, Printing or name-directory records.
- The `turn.stepIndex` to named-step change, covered by the runtime plan (§9).
