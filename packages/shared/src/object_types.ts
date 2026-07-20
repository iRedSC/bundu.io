type nullish<T> = T | null | undefined;

export type EntityStateValue = boolean | number | string;
export type EntityStateSnapshot = Record<string, EntityStateValue>;

export namespace GameObjectData {
    export const UnknownType = -0x01;
    export const UnknownData = [];

    export const PlayerType = 0x00;
    export type PlayerData = [
        name: string,
        mainhand: nullish<number>,
        offhand: nullish<number>,
        helmet: nullish<number>,
        backpack: boolean,
        playerSkin: nullish<number>,
        collisionRadius: number,
        /** `physics.scale` multiplier; identity = 1. */
        scale: number
    ];

    export const ResourceNodeType = 0x01;
    /** Free-floating or tile resource. Optional radius/scale override footprint defaults. */
    export type ResourceNodeData = [
        type: number,
        variant?: number,
        collisionRadius?: number,
        scale?: number
    ];

    export const StructureType = 0x02;
    export type StructureData = [
        type: number,
        variant?: number,
        health?: number,
        maxHealth?: number,
        states?: EntityStateSnapshot,
    ];

    export const GroundItemType = 0x03;
    export type GroundItemData = [itemId: number, amount: number];

    /** Autonomous living actor. Rotation is derived by clients from movement. */
    export const AnimalType = 0x04;
    export type AnimalData = [
        type: number,
        collisionRadius: number,
        health: number,
        maxHealth: number,
        /** `physics.scale` multiplier; identity = 1. */
        scale: number
    ];

    /**
     * Freecam shared cursor — player silhouette at the editor pointer.
     * Facing is derived by clients from movement (animal-style).
     * `playerSkin` uses the same variant wire id as players (future cosmetics).
     */
    export const FreecamGhostType = 0x05;
    export type FreecamGhostData = [
        name: string,
        playerSkin: nullish<number>,
    ];

    /** Maps LoadObject.type → typed payload tuple. */
    export type ByType = {
        [PlayerType]: PlayerData;
        [ResourceNodeType]: ResourceNodeData;
        [StructureType]: StructureData;
        [GroundItemType]: GroundItemData;
        [AnimalType]: AnimalData;
        [FreecamGhostType]: FreecamGhostData;
    };
}
