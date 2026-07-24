import { TILE_SIZE, worldToTile } from "@bundu/shared/tiles";
import { Attributes } from "../components/attributes.js";
import { Physics, ResourceData, TileEntity, Type } from "../components/base.js";
import { Flags } from "../components/flags.js";
import { PlayerData } from "../components/player.js";
import { BuildingConfigs } from "../configs/loaders/buildings.js";
import { distanceClauseMaxTiles } from "../configs/entity_filter.js";
import { flagRegistry } from "../configs/flag_registry.js";
import type {
    EffectContext,
    EffectPayload,
    EquipContextName,
} from "../configs/loaders/effect_context.js";
import {
    contextHasEffects,
    matchingPayloads,
} from "../configs/loaders/effect_context.js";
import type { Hide } from "../configs/loaders/hide.js";
import { orHide } from "../configs/loaders/hide.js";
import { GroundTypeConfigs } from "../configs/loaders/ground_types.js";
import { ItemConfigs } from "../configs/loaders/items.js";
import { ResourceConfigs } from "../configs/loaders/resources.js";
import { gameplayConfig } from "../configs/gameplay.js";
import { System, type GameObject, type World } from "../engine";
import { syncFlags, clearFlagSync } from "../network/flags.js";
import type { GameEventMap } from "./event_map.js";
import {
    applyContextEffects,
    applyFlags,
    applyMaxEffects,
    clearContextSource,
    payloadForSubject,
    payloadIsEmpty,
} from "./effect_apply.js";
import {
    subjectMatchesTarget,
    targetCanAffectOthers,
} from "./effect_targets.js";
import { topGroundAt } from "./ground_at.js";
import { getSizedBounds } from "./position.js";
import { isPlayerFriendlyTo } from "./structure_friendly.js";

/** Engine source id + flag for hostile player proximity. */
const NEAR_ENEMY_SOURCE = "near_enemy";
/** Euclidean tile radius for {@link NEAR_ENEMY_SOURCE}. */
const NEAR_ENEMY_TILES = 3;
const NEAR_ENEMY_RANGE = NEAR_ENEMY_TILES * TILE_SIZE;
const NEAR_ENEMY_RANGE_SQ = NEAR_ENEMY_RANGE * NEAR_ENEMY_RANGE;

type Applied = {
    sources: Set<string>;
};

const appliedBySubject = new Map<number, Applied>();

const EQUIP_SLOTS = [
    ["mainHand", "whenMainHand"],
    ["offHand", "whenOffHand"],
    ["helmet", "whenHelmet"],
] as const satisfies ReadonlyArray<
    readonly ["mainHand" | "offHand" | "helmet", EquipContextName]
>;

let cachedMaxProximity: number | undefined;
let cachedMaxEquipEmanation: number | undefined;

/** Largest authored whenNearby distance (decitiles / world units). */
function maxProximityDistance(): number {
    if (cachedMaxProximity !== undefined) return cachedMaxProximity;
    let max = 0;
    for (const config of BuildingConfigs.entries.values()) {
        const d = config.whenNearby?.proximityDistance;
        if (d !== undefined && d > max) max = d;
    }
    for (const config of ResourceConfigs.entries.values()) {
        const d = config.whenNearby?.proximityDistance;
        if (d !== undefined && d > max) max = d;
    }
    cachedMaxProximity = max;
    return max;
}

/**
 * Scan radius for equip selectors that target other entities.
 * World units. 0 = nothing authored; falls back to render distance when
 * an unbounded `@a` (no finite distance max) is present.
 */
function maxEquipEmanationDistance(): number {
    if (cachedMaxEquipEmanation !== undefined) return cachedMaxEquipEmanation;
    let maxTiles = 0;
    let unbounded = false;
    for (const config of ItemConfigs.entries.values()) {
        for (const contextName of [
            "whenMainHand",
            "whenOffHand",
            "whenHelmet",
        ] as const) {
            const context = config[contextName];
            if (!context) continue;
            for (const target of context.targets) {
                if (!targetCanAffectOthers(target)) continue;
                const tiles = distanceClauseMaxTiles(target.clauses);
                if (tiles === undefined) {
                    unbounded = true;
                    break;
                }
                if (tiles > maxTiles) maxTiles = tiles;
            }
            if (unbounded) break;
        }
        if (unbounded) break;
    }
    if (unbounded) {
        const rd = gameplayConfig().renderDistance;
        cachedMaxEquipEmanation = Math.max(rd.x, rd.y);
    } else {
        cachedMaxEquipEmanation = maxTiles * TILE_SIZE;
    }
    return cachedMaxEquipEmanation;
}

function getApplied(id: number): Applied {
    let entry = appliedBySubject.get(id);
    if (!entry) {
        entry = { sources: new Set() };
        appliedBySubject.set(id, entry);
    }
    return entry;
}

function tileConfig(object: GameObject): {
    whenOccupied?: EffectContext;
    whenNearby?: EffectContext;
} | undefined {
    const type = Type.get(object);
    if (!type) return undefined;
    if (ResourceData.get(object)) {
        return ResourceConfigs.get(type.id);
    }
    if (TileEntity.get(object)) {
        return BuildingConfigs.get(type.id);
    }
    return undefined;
}

function occupiedMatch(
    subject: GameObject,
    source: GameObject,
    context: EffectContext
): boolean {
    const physics = Physics.get(subject);
    const tile = TileEntity.get(source);
    if (!physics || !tile) return false;

    if (context.occupationType === "collider") {
        const sourcePhys = Physics.get(source);
        if (!sourcePhys) return false;
        const dx = physics.position.x - sourcePhys.position.x;
        const dy = physics.position.y - sourcePhys.position.y;
        const range =
            physics.collisionRadius + (sourcePhys.collisionRadius ?? 0);
        return dx * dx + dy * dy <= range * range;
    }

    const tx = worldToTile(physics.position.x);
    const ty = worldToTile(physics.position.y);
    return tile.occupied.some((cell) => cell.x === tx && cell.y === ty);
}

function nearbyMatch(
    subject: GameObject,
    source: GameObject,
    context: EffectContext
): boolean {
    const a = Physics.get(subject);
    const b = Physics.get(source);
    const dist = context.proximityDistance;
    if (!a || !b || dist === undefined) return false;
    const dx = a.position.x - b.position.x;
    const dy = a.position.y - b.position.y;
    return dx * dx + dy * dy <= dist * dist;
}

/**
 * Applies whenOccupied / whenNearby attribute + flag effects.
 * Hide is read on demand via {@link resolveSpatialHide}.
 */
export class EffectContextSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [PlayerData, Attributes, Physics, Flags], 5);
    }

    override update(_time: number, _delta: number, subject: GameObject): void {
        if (PlayerData.get(subject)?.freecam) {
            this.clearAll(subject);
            syncFlags(subject, this.world.context.playerPacketManager);
            return;
        }
        this.syncEffects(subject);
        syncFlags(subject, this.world.context.playerPacketManager);
    }

    override exit(subject: GameObject): void {
        this.clearAll(subject);
        syncFlags(subject, this.world.context.playerPacketManager, true);
        clearFlagSync(subject.id);
    }

    private clearAll(subject: GameObject): void {
        const applied = appliedBySubject.get(subject.id);
        if (!applied) return;
        for (const sourceId of applied.sources) {
            clearContextSource(subject, sourceId);
        }
        applied.sources.clear();
        appliedBySubject.delete(subject.id);
    }

    private syncEffects(subject: GameObject): void {
        const desired = new Set<string>();
        const maxContribs: EffectPayload[] = [];

        const physics = Physics.get(subject);
        if (!physics) return;

        const tx = worldToTile(physics.position.x);
        const ty = worldToTile(physics.position.y);
        for (const layer of ["floor", "structure", "roof"] as const) {
            const id = this.world.context.occupancy.get(tx, ty, layer);
            if (id === undefined) continue;
            const source = this.world.getObject(id);
            if (!source) continue;
            this.considerOccupied(subject, source, desired);
        }

        this.considerGroundOccupied(subject, tx, ty, desired);

        const range = maxProximityDistance();
        const candidates =
            range <= 0
                ? []
                : this.world.query(
                      [TileEntity, Physics, Type],
                      this.world.context.quadtree.query(
                          getSizedBounds(physics.position, range, range)
                      )
                  );

        for (const source of candidates) {
            const config = tileConfig(source);
            const context = config?.whenNearby;
            if (!context || !contextHasEffects(context)) continue;
            if (!nearbyMatch(subject, source, context)) continue;

            const payload = payloadForSubject(context, (t) =>
                subjectMatchesTarget(subject, t, {
                    world: this.world,
                    executor: source,
                })
            );
            if (payloadIsEmpty(payload)) continue;

            if (context.stack === "max") {
                maxContribs.push(payload);
                continue;
            }

            const sourceId = applyContextEffects(
                subject,
                "whenNearby",
                context,
                payload,
                source.id
            );
            if (sourceId) desired.add(sourceId);
        }

        if (maxContribs.length > 0) {
            const sourceId = applyMaxEffects(
                subject,
                "whenNearby",
                maxContribs
            );
            if (sourceId) desired.add(sourceId);
        } else {
            clearContextSource(subject, "whenNearby");
        }

        this.syncEquip(subject, physics, desired);
        this.syncNearEnemy(subject, physics, desired);

        const applied = getApplied(subject.id);
        for (const sourceId of applied.sources) {
            if (!desired.has(sourceId)) {
                clearContextSource(subject, sourceId);
            }
        }
        applied.sources = desired;
    }

    /**
     * Grant `near_enemy` while any non-friendly, non-freecam player is within
     * {@link NEAR_ENEMY_TILES} Euclidean tiles.
     */
    private syncNearEnemy(
        subject: GameObject,
        physics: Physics,
        desired: Set<string>
    ): void {
        const flags = Flags.get(subject);
        if (!flags) return;

        const others = this.world.query(
            [PlayerData, Physics],
            this.world.context.quadtree.query(
                getSizedBounds(physics.position, NEAR_ENEMY_RANGE, NEAR_ENEMY_RANGE)
            )
        );

        let near = false;
        for (const other of others) {
            if (other === subject) continue;
            const otherData = PlayerData.get(other);
            if (!otherData || otherData.freecam) continue;
            if (isPlayerFriendlyTo(subject, other)) continue;

            const otherPhys = Physics.get(other);
            if (!otherPhys) continue;
            const dx = physics.position.x - otherPhys.position.x;
            const dy = physics.position.y - otherPhys.position.y;
            if (dx * dx + dy * dy <= NEAR_ENEMY_RANGE_SQ) {
                near = true;
                break;
            }
        }

        if (!near) return;

        const flagId = flagRegistry().resolve(
            NEAR_ENEMY_SOURCE,
            "engine:near_enemy"
        );
        applyFlags(flags, NEAR_ENEMY_SOURCE, [flagId]);
        desired.add(NEAR_ENEMY_SOURCE);
    }

    /**
     * Re-evaluate own gear (so `time=` / `ground=` stay live) and apply
     * emanating `@a[distance=…]` effects from nearby holders.
     */
    private syncEquip(
        subject: GameObject,
        physics: Physics,
        desired: Set<string>
    ): void {
        const data = PlayerData.get(subject);
        if (!data) return;

        // Self gear: re-evaluate so time=/ground= stay live. Managed by inventory
        // equip/unequip too — do not put bare whenMainHand ids into `desired`, or
        // freecam clearAll would unequip-attribute wipe (legacy setSlot behavior).
        const selfCtx = { world: this.world, executor: subject };
        for (const [slot, contextName] of EQUIP_SLOTS) {
            const itemId = data[slot];
            if (itemId === undefined) {
                clearContextSource(subject, contextName);
                continue;
            }
            const context = ItemConfigs.get(itemId)[contextName];
            if (!context || !contextHasEffects(context)) {
                clearContextSource(subject, contextName);
                continue;
            }
            const payload = payloadForSubject(context, (t) =>
                subjectMatchesTarget(subject, t, selfCtx)
            );
            if (payloadIsEmpty(payload)) {
                clearContextSource(subject, contextName);
            } else {
                applyContextEffects(subject, contextName, context, payload);
            }
        }

        const range = maxEquipEmanationDistance();
        if (range <= 0) return;

        const holders = this.world.query(
            [PlayerData, Physics],
            this.world.context.quadtree.query(
                getSizedBounds(physics.position, range, range)
            )
        );
        for (const holder of holders) {
            if (holder === subject) continue;
            const holderData = PlayerData.get(holder);
            if (!holderData) continue;
            const matchCtx = { world: this.world, executor: holder };
            for (const [slot, contextName] of EQUIP_SLOTS) {
                const itemId = holderData[slot];
                if (itemId === undefined) continue;
                const context = ItemConfigs.get(itemId)[contextName];
                if (!context || !contextHasEffects(context)) continue;
                if (!context.targets.some(targetCanAffectOthers)) continue;

                const payload = payloadForSubject(context, (t) =>
                    subjectMatchesTarget(subject, t, matchCtx)
                );
                if (payloadIsEmpty(payload)) continue;

                const sourceKey = `${contextName}:player:${holder.id}`;
                const sourceId = applyContextEffects(
                    subject,
                    sourceKey,
                    { ...context, stack: "replace" },
                    payload
                );
                if (sourceId) desired.add(sourceId);
            }
        }
    }

    private considerOccupied(
        subject: GameObject,
        source: GameObject,
        desired: Set<string>
    ): void {
        const config = tileConfig(source);
        const context = config?.whenOccupied;
        if (!context || !contextHasEffects(context)) return;
        if (!occupiedMatch(subject, source, context)) return;

        const payload = payloadForSubject(context, (t) =>
            subjectMatchesTarget(subject, t, {
                world: this.world,
                executor: source,
            })
        );
        if (context.stack === "max") {
            const sourceId = applyMaxEffects(
                subject,
                `whenOccupied:${source.id}`,
                [payload]
            );
            if (sourceId) desired.add(sourceId);
            return;
        }
        const sourceId = applyContextEffects(
            subject,
            "whenOccupied",
            context,
            payload,
            source.id
        );
        if (sourceId) desired.add(sourceId);
    }

    private considerGroundOccupied(
        subject: GameObject,
        tx: number,
        ty: number,
        desired: Set<string>
    ): void {
        const top = topGroundAt(this.world, tx, ty);
        if (!top) return;
        const context = GroundTypeConfigs.get(top.type).whenOccupied;
        if (!context || !contextHasEffects(context)) return;

        // Ground occupation is always "center" (standing on the tile).
        // Executor is the subject (standing on their own tile).
        const payload = payloadForSubject(context, (t) =>
            subjectMatchesTarget(subject, t, {
                world: this.world,
                executor: subject,
            })
        );
        if (payloadIsEmpty(payload)) return;

        const sourceKey = `whenOccupied:ground:${top.type}`;
        if (context.stack === "max") {
            const sourceId = applyMaxEffects(subject, sourceKey, [payload]);
            if (sourceId) desired.add(sourceId);
            return;
        }
        // Force replace-style source id keyed by ground type (not entity).
        const sourceId = applyContextEffects(
            subject,
            sourceKey,
            { ...context, stack: "replace" },
            payload
        );
        if (sourceId) desired.add(sourceId);
    }
}

/**
 * Visit each spatial hide payload separately (before OR-merge) so per-source
 * fields like exclusionTarget stay intact.
 */
export function forEachSpatialHidePayload(
    subject: GameObject,
    world: World,
    visit: (hide: Hide) => void
): void {
    const physics = Physics.get(subject);
    if (!physics) return;

    const tx = worldToTile(physics.position.x);
    const ty = worldToTile(physics.position.y);

    for (const layer of ["floor", "structure", "roof"] as const) {
        const id = world.context.occupancy.get(tx, ty, layer);
        if (id === undefined) continue;
        const source = world.getObject(id);
        if (!source) continue;
        const context = tileConfig(source)?.whenOccupied;
        if (!context) continue;
        if (!occupiedMatch(subject, source, context)) continue;
        for (const payload of matchingPayloads(context, (t) =>
            subjectMatchesTarget(subject, t, { world, executor: source })
        )) {
            if (payload.hide) visit(payload.hide);
        }
    }

    const top = topGroundAt(world, tx, ty);
    if (top) {
        const context = GroundTypeConfigs.get(top.type).whenOccupied;
        if (context) {
            for (const payload of matchingPayloads(context, (t) =>
                subjectMatchesTarget(subject, t, {
                    world,
                    executor: subject,
                })
            )) {
                if (payload.hide) visit(payload.hide);
            }
        }
    }

    const range = maxProximityDistance();
    const candidates =
        range <= 0
            ? []
            : world.query(
                  [TileEntity, Physics, Type],
                  world.context.quadtree.query(
                      getSizedBounds(physics.position, range, range)
                  )
              );
    for (const source of candidates) {
        const context = tileConfig(source)?.whenNearby;
        if (!context) continue;
        if (!nearbyMatch(subject, source, context)) continue;
        for (const payload of matchingPayloads(context, (t) =>
            subjectMatchesTarget(subject, t, { world, executor: source })
        )) {
            if (payload.hide) visit(payload.hide);
        }
    }
}

/** OR-merged hide from occupied + nearby tile entities + ground for a subject. */
export function resolveSpatialHide(
    subject: GameObject,
    world: World
): Hide | undefined {
    let hide: Hide | undefined;
    forEachSpatialHidePayload(subject, world, (payload) => {
        hide = orHide(hide, payload);
    });
    return hide;
}
