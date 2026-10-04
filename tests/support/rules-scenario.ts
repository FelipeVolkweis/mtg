import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readCatalog } from "../../src/server/catalog/catalog-files";
import { gameObject } from "../../src/server/match/game-objects";
import type { RoomState, ZoneKind } from "../../src/shared/model";

// Initial scenario construction is test-only. Assertions and every subsequent
// action use the public player command/view protocol; no fixture command exists.
export async function seedRulesScenario(invite: string, spellName?: string) {
  const pool = new Pool({
    connectionString:
      process.env.TEST_DATABASE_URL ??
      "postgres://mtg:mtg-local@127.0.0.1:5432/mtg_test",
  });
  try {
    const room = (
      await pool.query<{ document: RoomState }>(
        "SELECT document FROM rooms WHERE invite = $1",
        [invite],
      )
    ).rows[0].document;
    const match = room.match!;
    const catalog = await readCatalog();
    const player = match.players[0];
    function add(name: string, kind: ZoneKind) {
      const card = Object.values(catalog.definitions).find(
        (card) => card.canonicalName === name,
      )!;
      const zone = match.zones.find(
        (zone) =>
          zone.kind === kind && (kind !== "hand" || zone.ownerId === player.id),
      )!;
      const instanceId = randomUUID();
      match.instances[instanceId] = {
        id: instanceId,
        ownerId: player.id,
        definitionId: card.id,
        printingId: card.defaultPrintingId,
      };
      const object = gameObject("card", zone.id, player.id, card.components[0]);
      object.cardInstanceIds = [instanceId];
      match.objects[object.id] = object;
      zone.objectIds.push(object.id);
      match.rules!.controlledSinceTurn[object.id] = 0;
      return object;
    }
    const target = add(spellName ?? "Sol Ring", spellName ? "hand" : "stack");
    if (spellName) add("Mind Stone", "hand");
    add("Counterspell", "hand");
    add("Mind Stone", "battlefield");
    add("Sol Ring", "battlefield");
    match.rules!.setup.keptPlayerIds = match.players.map((player) => player.id);
    match.rules!.turnStarted[player.id] = 1;
    match.turn.activePlayerId = player.id;
    match.turn.stepIndex = 3;
    match.priority = { playerId: player.id, passedPlayerIds: [] };
    match.rules!.mana[player.id].U = spellName ? 5 : 2;
    match.revision++;
    room.revision++;
    await pool.query("UPDATE rooms SET document = $2 WHERE invite = $1", [
      invite,
      JSON.stringify(room),
    ]);
    return { targetId: target.id };
  } finally {
    await pool.end();
  }
}
