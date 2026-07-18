import { worldToTile } from "@bundu/shared/tiles";
import { Attributes } from "../components/attributes.js";
import { Physics, ResourceData, TileEntity, Type } from "../components/base.js";
import { Flags } from "../components/flags.js";
import { PlayerData } from "../components/player.js";
import { BuildingConfigs } from "../configs/loaders/buildings.js";
import type {
    EffectContext,
    EffectPayload,
} from "../configs/loaders/effect_context.js";
import { contextHasEffects } from "../configs/loaders/effect_context.js";
import type { Hide } from "../configs/loaders/hide.js";
import { orHide } from "../configs/loaders/hide.js";
import { GroundTypeConfigs } from "../configs/loaders/ground_types.js";
import { ResourceConfigs } from "../configs/loaders/resources.js";
import { System, type GameObject, type World } from "../engine";
import { syncFlags, clearFlagSync } from "../network/flags.js";
import type { GameEventMap } from "./event_map.js";
import {
    applyContextEffects,
    applyMaxEffects,
    clearContextSource,
    payloadForSubject,
    payloadIsEmpty,
} from "./effect_apply.js";
import { subjectMatchesTarget } from "./effect_targets.js";
import { topGroundAt } from "./ground_at.js";
import { getSizedBounds } from "./position.js";

type Applied = {
    sources: Set<string>;
};

const appliedBySubject = new Map<number, Applied>();

let cachedMaxProximity: number | undefined;

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
        this.syncSpatial(subject);
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

    private syncSpatial(subject: GameObject): void {
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
                subjectMatchesTarget(subject, t)
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

        const applied = getApplied(subject.id);
        for (const sourceId of applied.sources) {
            if (!desired.has(sourceId)) {
                clearContextSource(subject, sourceId);
            }
        }
        applied.sources = desired;
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
            subjectMatchesTarget(subject, t)
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
        const payload = payloadForSubject(context, (t) =>
            subjectMatchesTarget(subject, t)
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

/** OR-merged hide from occupied + nearby tile entities + ground for a subject. */
export function resolveSpatialHide(
    subject: GameObject,
    world: World
): Hide | undefined {
    const physics = Physics.get(subject);
    if (!physics) return undefined;

    let hide: Hide | undefined;
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
        const payload = payloadForSubject(context, (t) =>
            subjectMatchesTarget(subject, t)
        );
        hide = orHide(hide, payload.hide);
    }

    const top = topGroundAt(world, tx, ty);
    if (top) {
        const context = GroundTypeConfigs.get(top.type).whenOccupied;
        if (context) {
            const payload = payloadForSubject(context, (t) =>
                subjectMatchesTarget(subject, t)
            );
            hide = orHide(hide, payload.hide);
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
        const payload = payloadForSubject(context, (t) =>
            subjectMatchesTarget(subject, t)
        );
        hide = orHide(hide, payload.hide);
    }

    return hide;
}
