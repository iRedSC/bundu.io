type nullish<T> = T | null | undefined;

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
        collisionRadius: number
    ];

    export const ResourceNodeType = 0x01;
    /** Tile entity: type id only — footprint/collision come from shared tile rules. */
    export type ResourceNodeData = [type: number, variant?: number];

    export const StructureType = 0x02;
    export type StructureData = [type: number, variant?: number];

    export const GroundItemType = 0x03;
    export type GroundItemData = [itemId: number, amount: number];

    /** Maps LoadObject.type → typed payload tuple. */
    export type ByType = {
        [PlayerType]: PlayerData;
        [ResourceNodeType]: ResourceNodeData;
        [StructureType]: StructureData;
        [GroundItemType]: GroundItemData;
    };
}
