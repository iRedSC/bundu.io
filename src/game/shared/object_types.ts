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
        playerSkin: nullish<number>
    ];

    export const ResourceNodeType = 0x01;
    export type ResourceNodeData = [size: number, type: number];
}
