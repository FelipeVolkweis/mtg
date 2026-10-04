# Multiplayer Manual Tabletop implementation review

Implemented against the six Manual Tabletop tickets and the local-set importer dependency (Card Catalog and Data #01). The starting commit was `263f78e5d1c2c0dc4fab827daa94efe07d306aaf`. The parallel reviews examined the staged implementation before commit; follow-up reviews examined the corrections in the working tree. Existing specification, domain, ADR, and ticket edits are excluded from this implementation commit.

## Standards

The reviewer found two documented behavior violations, both corrected:

- **P1: Hidden meld parts crossed the transport.** Participant views now omit persisted meld snapshots and hidden parts' Card Instance references. Separating melded cards preserves their face-down state.
- **P2: Concurrent authentication could retain a phantom connection.** The gateway rechecks socket registration after its asynchronous credential lookup, so each socket registers once and disconnect revokes presence correctly.

Final reviewer report: “Both findings are resolved in the current working tree. The visibility helper, model, gateway, and related view changes introduce no remaining actionable documented-standard violations or baseline smells.”

## Spec

The reviewer found five partial or incorrect requirements, all corrected:

- **P2: Independent name mappings were incomplete.** Bulk metadata and the current name index map canonical, alternate, face, and composite names without admitting unimported cards to Decklists.
- **P2: Ability relationships lacked browser controls.** Object creation and relationship forms now record source Game Objects and Card Ability references.
- **P1: Casting or playing a selected back face reset it.** The selected face and corresponding characteristics survive moves to the Stack or Battlefield.
- **P2: Resolving a copy lost its immutable-record reference.** Resolution retains the captured copy record and its participant-visible projection.
- **P2: A card with no inspectors could not be revealed.** Inspection and reveal permissions are distinct; an owner or controller can reveal it without first receiving its hidden identity.

Final reviewer report: “No actionable findings in the final importer edits. The source handles gzip JSON Lines and legacy JSON bulk downloads, completes name resolution before persisting, and propagates download failures without replacing the saved catalog. Composite-name inference requires every constituent name to share one canonical identity.” No scope creep was found. The separate comprehensive structured catalog/rules work remains outside this implementation.

## Validation

- `npm run typecheck`: passed for server, client, and tests.
- `npx playwright test`: all **17** acceptance tests passed in the single final full-suite run. Coverage includes two to four players, whole-list rejection and exact printings, release-only dragging at 1280×720, ordered revisions and concurrent stale actions, private projections, faces/copies/meld, ability references, restart recovery, keepalive-independent expiry, and rematch consent.
- `docker compose up --build -d app`: production image built successfully. Container smoke checks verified HTTP 200 health, the built frontend, and local catalog access.
- `npm run catalog:import -- fdn`: real Scryfall import succeeded with **771 printings**, including the independent full Card Name Directory. Fixture-based CLI tests also cover current compressed JSON Lines and legacy JSON downloads, idempotence, truncated downloads, and provider failure.
- `git diff --cached --check`: passed.

Review totals: Standards **2 resolved, 0 remaining** (original worst: P1 privacy); Spec **5 resolved, 0 remaining** (original worst: P1 face selection).
