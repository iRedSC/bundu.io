import { Box, Circle, Vector } from "sat";
import type { OccupancyLayer } from "@bundu/shared/occupancy_layer";
import { Component } from "../engine";
import type { TilePos, TileRot } from "@bundu/shared/tiles";

export type Physics = {
    position: Vector;
    collider: Circle;
    rotation: number;
    collisionRadius: number;
    speed: number;
};
export const Physics = Component.register<Physics>(() => {
    const position = new Vector();

    return {
        position,
        collider: new Circle(position, 15),
        collisionRadius: 15,
        speed: 0,
        rotation: 0,
    };
});

/** Tile-grid entity: integer origin, discrete rot, occupied world tiles. */
export type TileEntity = {
    origin: TilePos;
    rot: TileRot;
    /** Player that placed this tile entity, if it was player-placed. */
    ownerId?: number;
    /** Local blocked offsets (before rotation). */
    blocked: TilePos[];
    /** Cached world tiles currently claimed in the occupancy grid. */
    occupied: TilePos[];
    /** Occupancy stack slot; set from building/resource config on spawn. */
    layer: OccupancyLayer;
};
export const TileEntity = Component.register<TileEntity>(() => ({
    origin: { x: 0, y: 0 },
    rot: 0,
    blocked: [{ x: 0, y: 0 }],
    occupied: [],
    layer: "structure",
}));

export type VisualBounds = {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
};
export const VisualBounds = Component.register<VisualBounds>(() => ({
    minX: 0,
    minY: 0,
    maxX: 0,
    maxY: 0,
}));

export type CalculateCollisions = Record<string, never>;
export const CalculateCollisions = Component.register<CalculateCollisions>(
    () => ({})
);

export type Type = { id: number; variant?: string };
export const Type = Component.register<Type>(() => ({ id: 0 }));

export type Door = { open: boolean };
export const Door = Component.register<Door>(() => ({ open: false }));

export type GroundData = {
    collider: Box;
    type: number;
    createPacket: () => [
        type: number,
        x: number,
        y: number,
        w: number,
        h: number,
    ];
};
export const GroundData = Component.register<GroundData>(() => ({
    collider: new Box(new Vector(), 100, 100),
    type: 1,
    createPacket() {
        return [
            this.type,
            this.collider.pos.x,
            this.collider.pos.y,
            this.collider.w,
            this.collider.h,
        ];
    },
}));

/** Cosmetic free-placed sprite; not in render-distance / physics. */
export type DecorationData = {
    type: number;
    x: number;
    y: number;
    /** Degrees. */
    rotation: number;
    /** Multiplier on registry base size. */
    scale: number;
};
export const DecorationData = Component.register<DecorationData>(() => ({
    type: 1,
    x: 0,
    y: 0,
    rotation: 0,
    scale: 1,
}));

export type ResourceData = {
    quantity: number;
    maximumQuantity: number;
    lootTableId: number | null;
    lootSeed: number;
    harvestHit: number;
    decayAt: number | null;
    lastRegen: number;
    /** Runtime stacks (e.g. player corpse inventory); bypasses loot tables. */
    lootStacks: { id: number; count: number }[] | null;
};
export const ResourceData = Component.register<ResourceData>(() => ({
    quantity: 0,
    maximumQuantity: 0,
    lootTableId: null,
    lootSeed: 0,
    harvestHit: 0,
    decayAt: null,
    lastRegen: 0,
    lootStacks: null,
}));

/** A structure whose owner died and can be claimed or will decay. */
export type Rotting = Record<string, never>;
export const Rotting = Component.register<Rotting>(() => ({}));

/** Wall/door that has had a matching-tier spike attached. */
export type Spiked = {
    /** Per-target contact attack cooldowns (target id → next allowed gameTime). */
    nextHitAt: Map<number, number>;
    /** Animals that attacked this spike; contact DPS only hits these. */
    hostileAnimalIds: Set<number>;
};
export const Spiked = Component.register<Spiked>(() => ({
    nextHitAt: new Map(),
    hostileAnimalIds: new Set(),
}));

export type GroundItemData = {
    itemId: number;
    amount: number;
    /** Ground items cannot be immediately re-picked by their dropper. */
    pickupAt: number;
};
export const GroundItemData = Component.register<GroundItemData>(() => ({
    itemId: 0,
    amount: 0,
    pickupAt: 0,
}));

export type Health = {
    max: number;
    value: number;
    /** Game time of last regen tick; per-entity so cadence is not shared. */
    lastRegen: number;
};

export const Health = Component.register<Health>(() => ({
    max: 100,
    value: 100,
    lastRegen: 0,
}));

/** Marker for creatures spikes (and similar) may damage. Players + animals. */
export type Living = Record<string, never>;
export const Living = Component.register<Living>(() => ({}));

export type AnimalData = {
    /** Stable config/type id. */
    type: number;
    targetId?: number;
    destination?: { x: number; y: number };
    path: { x: number; y: number }[];
    state: "idle" | "wander" | "chase" | "flee";
    stateUntil: number;
    nextThinkAt: number;
    nextAttackAt: number;
    /** Next periodic aggroSwitch / aggroLevel check. */
    nextAggroCheckAt: number;
    /** While gameTime is below this, the animal will not acquire a target. */
    lostAggroUntil: number;
    /**
     * gameTime when the animal last failed to make progress while seeking.
     * 0 means currently unstuck / not seeking.
     */
    stuckSince: number;
};
export const AnimalData = Component.register<AnimalData>(() => ({
    type: 0,
    path: [],
    state: "idle",
    stateUntil: 0,
    nextThinkAt: 0,
    nextAttackAt: 0,
    nextAggroCheckAt: 0,
    lostAggroUntil: 0,
    stuckSince: 0,
}));
