import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { readCatalog } from "../../src/server/catalog/catalog-files";
import { gameObject } from "../../src/server/match/game-objects";
import type { RoomState, ZoneKind } from "../../src/shared/model";

// Initial scenario construction is test-only. Assertions and every subsequent
// action use the public player command/view protocol; no fixture command exists.
export async function seedRulesScenario(
  invite: string,
  spellName?: string,
  synergies = false,
  scenario?: "combat" | "flash" | "draw" | "inspect",
) {
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
    const combat = scenario === "combat";
    function add(name: string, kind: ZoneKind, seat = 0) {
      const player = match.players[seat];
      const card = Object.values(catalog.definitions).find(
        (card) => card.canonicalName === name,
      )!;
      const zone = match.zones.find(
        (zone) =>
          zone.kind === kind &&
          (kind === "battlefield" ||
            kind === "stack" ||
            zone.ownerId === player.id),
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
    if (combat) {
      add("Cultivator's Caravan", "battlefield");
      const creature = add("Silver Myr", "battlefield");
      creature.counters = [{ kind: "+1/+1", quantity: "2" }];
      add("Silver Myr", "battlefield", 1);
      add("Silver Myr", "battlefield", 1);
      add("Propaganda", "battlefield", 1);
      match.rules!.mana[player.id].U = 0;
    }
    if (synergies) {
      add("Sai, Master Thopterist", "battlefield");
      add("Vedalken Archmage", "battlefield");
      add("Chief of the Foundry", "battlefield");
      add("Steel Overseer", "battlefield");
    }
    const target = add(
      spellName ?? "Sol Ring",
      spellName || combat || scenario === "draw" || scenario === "inspect"
        ? "hand"
        : "stack",
    );
    if (spellName) add("Mind Stone", "hand");
    add("Counterspell", "hand");
    add("Mind Stone", "battlefield");
    add("Sol Ring", "battlefield");
    match.rules!.setup.keptPlayerIds = match.players.map((player) => player.id);
    match.rules!.turnStarted[player.id] = 1;
    match.turn.activePlayerId = player.id;
    match.turn.stepIndex = scenario === "flash" ? 4 : 3;
    match.priority = { playerId: player.id, passedPlayerIds: [] };
    match.rules!.mana[player.id].U = combat ? 0 : spellName ? 5 : 2;
    if (scenario === "draw") {
      add("Mind's Eye", "battlefield");
      add("Mind Stone", "battlefield", 1);
      match.rules!.mana[player.id].U = 0;
      match.rules!.mana[match.players[1].id].U = 1;
      match.priority = { playerId: match.players[1].id, passedPlayerIds: [] };
    }
    if (scenario === "inspect") {
      const creature = add("Silver Myr", "battlefield");
      add("Adaptive Omnitool", "battlefield").attachmentTo = creature.id;
      const artifact = add("Mind Stone", "library");
      const library = match.zones.find((z) => z.id === artifact.zoneId)!;
      library.objectIds = [
        artifact.id,
        ...library.objectIds.filter((id) => id !== artifact.id),
      ];
    }
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
