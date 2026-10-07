import type {
  GameObject,
  MatchState,
  ProposalRecord,
  RoomState,
  ZoneKind,
  ZoneState,
} from "../../shared/model.js";
import type { ManaType, PendingProcedure } from "../../shared/rules.js";
import { gameObject, moveObject } from "../match/game-objects.js";
import {
  liftAbility,
  liftContinuousEffect,
  liftResolution,
  liftRuntimeAbility,
} from "./lift-v1-effects.js";

/** The Room document shape this server writes (CM §5). */
export const currentSnapshotVersion = 6;

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
 * Version 5 (roadmap issue 9): a suspended Priority Checkpoint keeps its
 * progress in `rules.checkpoint`. Version 4's cleanup marker becomes a cleanup
 * checkpoint, the Priority player kept for after triggers becomes its grant,
 * and a Graveyard or exile commander return is tagged as the state-based
 * choice it is. A trigger or commander choice with neither was waiting to
 * grant the active player Priority.
 */
function upgradeMatchToVersion5(match: Document) {
  const rules = match.rules as Document | undefined;
  if (!rules) return;
  const pending = rules.pending as Document | undefined;
  if (rules.cleanupNeedsPriority !== undefined)
    rules.checkpoint = {
      cleanup: { performed: rules.cleanupNeedsPriority === true },
    };
  else if (typeof rules.priorityAfterTriggers === "string")
    rules.checkpoint = { playerId: rules.priorityAfterTriggers };
  else if (
    ["trigger-order", "trigger-target", "commander-return"].includes(
      pending?.kind as string,
    ) &&
    !rules.commanderReplay
  )
    rules.checkpoint = {};
  delete rules.cleanupNeedsPriority;
  delete rules.priorityAfterTriggers;
  if (
    pending?.kind === "commander-return" &&
    pending.sourceId &&
    !rules.commanderReplay
  )
    pending.stateBasedRule = "commander-return";
}

/** Version 5 chosen values and casting record become a Proposal Record. */
function proposalRecord(object: Document, zones: ZoneState[]) {
  const casting = object.casting as Document | null | undefined;
  const variables = (object.variables ?? []) as {
    name: string;
    value: string;
  }[];
  delete object.casting;
  delete object.variables;
  if (!casting && !variables.length) return null;
  const sourceZone = zones.find((z) => z.id === casting?.sourceZoneId)?.kind;
  const record: ProposalRecord = {
    ...(sourceZone ? { sourceZone } : {}),
    variables: Object.fromEntries(
      variables.map((v) => [v.name, Number(v.value)]),
    ),
    modes: (casting?.modes as string[] | undefined) ?? [],
    optionalCosts: [],
    manaSpent: (casting?.manaSpent as ManaType[] | undefined) ?? [],
  };
  return record;
}

/**
 * A version 5 cast or activation in progress kept the card where it was and
 * nothing on the Stack. It becomes a Stack proposal (roadmap issue 10): the
 * stored Match, without the pending procedure, is its rollback snapshot, and
 * the spell moves to the Stack (or the ability is created there) as it would
 * have at the start of the proposal.
 */
function upgradeProposal(match: MatchState) {
  const rules = match.rules;
  const replay = rules.commanderReplay;
  const proposing = (p?: PendingProcedure) =>
    (p?.kind === "cast" || p?.kind === "activate") && !p.proposal;
  // A commander replacement prompt interrupted a command made during the
  // proposal. Restore the Match from before that command; its player
  // repeats it.
  if (replay && proposing(replay.previousPending)) {
    rules.pending = replay.previousPending;
    if (replay.previousPriority) match.priority = replay.previousPriority;
    else delete match.priority;
    delete rules.commanderReplay;
  }
  const pending = rules.pending;
  if (!pending || !proposing(pending)) return;
  const legacy = pending as PendingProcedure & {
    variables?: Record<string, number>;
  };
  const variables = { ...legacy.variables };
  delete legacy.variables;
  const stack = match.zones?.find((z) => z.kind === "stack");
  const source = match.objects?.[pending.sourceId!];
  if (!stack || !source) return;
  const base = structuredClone(match);
  delete base.rules.pending;
  const record = (sourceZone?: ZoneKind): ProposalRecord => ({
    ...(sourceZone ? { sourceZone } : {}),
    variables,
    modes: [],
    optionalCosts: [],
    manaSpent: [],
  });
  let stacked: GameObject;
  if (pending.kind === "cast") {
    const from = match.zones.find((z) => z.id === source.zoneId)!.kind;
    stacked = moveObject(match, source.id, stack);
    stacked.proposal = record(from);
    rules.revealedHandIds = rules.revealedHandIds?.filter(
      (id) => id !== source.id,
    );
    pending.sourceId = stacked.id;
  } else {
    stacked = gameObject(
      "ability",
      stack.id,
      pending.playerId,
      pending.playerId,
      {
        name: `${source.characteristics.name}: ${pending.abilityId}`,
        colors: [],
        typeLine: "Ability",
        rulesText: "",
      },
    );
    stacked.sourceObjectId = source.id;
    stacked.sourceAbilityId = pending.abilityId;
    stacked.proposal = record();
    match.objects[stacked.id] = stacked;
    stack.objectIds.push(stacked.id);
  }
  pending.proposal = {
    stackObjectId: stacked.id,
    locked: pending.stage === "payment",
    base,
  };
}

/**
 * Version 6 (roadmap issues 10 and 11). Legacy manual Matches are retired: a
 * stored manual Match ends and its Room returns to the lobby, keeping each
 * participant's Decklists. An automated Match drops its mode marker, its
 * objects' chosen values and casting records become Proposal Records, and a
 * cast or activation in progress becomes a Stack proposal.
 */
function upgradeRoomToVersion6(room: Document) {
  const match = room.match as Document | undefined;
  if (!match) return;
  if (match.mode === "manual" || !match.rules) {
    delete room.match;
    delete room.rematch;
    for (const participant of (room.participants ?? []) as Document[])
      participant.ready = false;
    return;
  }
  delete match.mode;
  const zones = (match.zones ?? []) as ZoneState[];
  for (const object of Object.values(
    (match.objects ?? {}) as Record<string, Document>,
  ))
    object.proposal = proposalRecord(object, zones);
  upgradeProposal(match as unknown as MatchState);
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
  if (version < 5 && room.match) upgradeMatchToVersion5(room.match as Document);
  if (version < 6) upgradeRoomToVersion6(room);
  room.snapshotVersion = currentSnapshotVersion;
  return stored;
}
