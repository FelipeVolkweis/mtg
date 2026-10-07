import type { RoomState } from "../../shared/model.js";
import {
  liftAbility,
  liftContinuousEffect,
  liftResolution,
  liftRuntimeAbility,
} from "./lift-v1-effects.js";

/** The Room document shape this server writes (CM §5). */
export const currentSnapshotVersion = 4;

type Document = Record<string, unknown>;

// Fields removed from the runtime model by ADR-0018 (card-model-refactor.md §4.1).
const removedMatchFields = [
  "diceRolls",
  "openingHandActions",
  "stickerSheets",
  "copiableValues",
  "layout",
];
const removedObjectFields = [
  "designations",
  "choices",
  "stickerPlacements",
  "meldParts",
  "protectorId",
  "faceDown",
  "copiableValuesId",
];
const removedStatusFields = ["flipped", "phasedOut"];

function upgradeMatchToVersion2(match: Document) {
  for (const field of removedMatchFields) delete match[field];
  const instances = (match.instances ?? {}) as Record<
    string,
    { ownerId: string }
  >;
  for (const object of Object.values(
    (match.objects ?? {}) as Record<string, Document>,
  )) {
    for (const field of removedObjectFields) delete object[field];
    const status = object.status as Document | undefined;
    if (status) for (const field of removedStatusFields) delete status[field];
    // Version 1 stored an owner only on tokens; cards took theirs from the
    // Card Instance and anything else fell back to its controller.
    if (typeof object.ownerId !== "string") {
      const instanceIds = (object.cardInstanceIds ?? []) as string[];
      object.ownerId =
        instances[instanceIds[0]]?.ownerId ?? (object.controllerId as string);
    }
  }
}

/**
 * Version 3 runs Core AST effects (roadmap issue 7): every stored runtime
 * ability and an in-flight resolution are lifted from the version 1 effects.
 */
function upgradeMatchToVersion3(match: Document) {
  for (const object of Object.values(
    (match.objects ?? {}) as Record<string, Document>,
  ))
    liftAbility(
      (object.resolution as Document | undefined)?.ability as Document,
    );
  const rules = match.rules as Document | undefined;
  if (!rules) return;
  const pending = (p: unknown) =>
    liftAbility((p as Document | undefined)?.ability as Document);
  pending(rules.pending);
  pending((rules.commanderReplay as Document | undefined)?.previousPending);
  for (const list of [rules.waitingTriggers, rules.triggerPlacement])
    for (const trigger of (list ?? []) as Document[])
      liftAbility(trigger.ability as Document);
  if (rules.resolving) liftResolution(rules.resolving as Document);
}

/**
 * Version 4 (roadmap issue 8): the engine runs Core abilities, and
 * resolutions run in the Rule VM. Stored runtime abilities and continuous
 * effects in force are lifted to Core; an in-flight resolution becomes an
 * execution.
 */
function upgradeMatchToVersion4(match: Document) {
  const objects = (match.objects ?? {}) as Record<string, Document>;
  for (const object of Object.values(objects)) {
    const resolution = object.resolution as Document | undefined;
    if (!resolution?.ability) continue;
    resolution.ability = liftRuntimeAbility(
      resolution.ability as Document,
      object.kind === "card" ? "spell" : "activated",
      (object.sourceAbilityId as string | undefined) ?? "cast",
    );
  }
  const rules = match.rules as Document | undefined;
  if (!rules) return;
  const kinds = {
    cast: "spell",
    activate: "activated",
    "trigger-target": "triggered",
  } as const;
  for (const pending of [
    rules.pending,
    (rules.commanderReplay as Document | undefined)?.previousPending,
  ] as (Document | undefined)[]) {
    if (!pending?.ability) continue;
    const kind = kinds[pending.kind as keyof typeof kinds] ?? "activated";
    const stacked = objects[pending.sourceId as string];
    pending.ability = liftRuntimeAbility(
      pending.ability as Document,
      kind,
      (pending.abilityId as string | undefined) ??
        (kind === "triggered"
          ? ((stacked?.sourceAbilityId as string | undefined) ?? "trigger")
          : "cast"),
    );
  }
  for (const list of [rules.waitingTriggers, rules.triggerPlacement])
    for (const trigger of (list ?? []) as Document[])
      trigger.ability = liftRuntimeAbility(
        trigger.ability as Document,
        "triggered",
        trigger.abilityId as string,
      );
  for (const list of [rules.temporaryEffects, rules.continuousEffects])
    for (const effect of (list ?? []) as Document[])
      liftContinuousEffect(effect);
  upgradeResolutionToVersion4(rules);
}

/**
 * The version 3 queue becomes one frame. Version 3 removed each instruction
 * before running it and kept a waiting one aside, so the waiting instruction
 * goes first, at the program counter, and the rest follow; nothing runs
 * again. The untyped binding maps become typed bindings.
 */
function upgradeResolutionToVersion4(rules: Document) {
  const progress = rules.resolving as Document | undefined;
  if (!progress) return;
  const waiting = progress.waiting as
    { effect: unknown; state: unknown } | undefined;
  const bindings: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(
    (progress.bindings ?? {}) as Record<string, number>,
  ))
    bindings[name] = { kind: "number", value };
  for (const [name, ids] of Object.entries(
    (progress.objects ?? {}) as Record<string, string[]>,
  ))
    bindings[name] = { kind: "objects", ids };
  for (const [name, id] of Object.entries(
    (progress.players ?? {}) as Record<string, string>,
  ))
    bindings[name] = { kind: "player", id };
  rules.resolving = {
    stackObjectId: progress.sourceId,
    controllerId: progress.playerId,
    frames: [
      {
        instructions: [
          ...(waiting ? [waiting.effect] : []),
          ...((progress.remaining ?? []) as unknown[]),
        ],
        pc: 0,
      },
    ],
    bindings,
    ...(waiting ? { waiting: { state: waiting.state } } : {}),
    ...(progress.inspectedIds ? { inspectedIds: progress.inspectedIds } : {}),
  };
}

/**
 * Brings a stored Room document up to the current snapshot version. Pure: it
 * returns the upgraded document and never touches storage. Version 1 handling
 * can be deleted once every version 1 Room has expired (ROOM_EXPIRY_DAYS after
 * this deploys).
 */
export function upgradeRoom(stored: RoomState): RoomState {
  const room = stored as unknown as Document;
  const version = (room.snapshotVersion as number | undefined) ?? 1;
  if (version > currentSnapshotVersion)
    throw new Error(
      `Room snapshot version ${version} is newer than this server supports.`,
    );
  if (version < 2 && room.match) upgradeMatchToVersion2(room.match as Document);
  if (version < 3 && room.match) upgradeMatchToVersion3(room.match as Document);
  if (version < 4 && room.match) upgradeMatchToVersion4(room.match as Document);
  room.snapshotVersion = currentSnapshotVersion;
  return stored;
}
