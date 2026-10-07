---
status: proposed
---

# Runtime model carries only supported capacity

The Card Catalog may model the full card pool's forms and characteristics (ADR-0005), but the Match runtime model (Game Objects, Match state and Room snapshots) carries only the fields that supported cards and released Match behavior use. Variant object kinds and Zones, meld, Battle Protector, face-down state, flip and phasing status, stickers, designations, copiable-value captures, dice rolls, opening-hand actions and spatial layout are removed from the runtime model until a supported card needs them. Manual Match state goes with them: a stored manual Match ends when its Room loads, and every Match is rules-automated. A removed field returns only with a supported card, a gameplay test and a projection decision. Ownership is stored once on every Game Object.

This supersedes the runtime part of the "modeling capacity" stance in the ADR index and [Card model guidance](../card-model.md), and ADR-0010's retention of spatial data for legacy compatibility. Definition, Printing, Instance and Object separation (ADR-0006) is unchanged. The change is planned in [card-model-refactor.md](../plans/card-model-refactor.md) and lands with runtime milestone M1; this record becomes accepted when that code ships.
