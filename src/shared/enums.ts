export enum PACKET_TYPE {
    MOVE_OBJECT = 100,

    NEW_PLAYER = 200,
    UPDATE_PLAYER_GEAR = 201,

    NEW_STRUCTURE = 300,
}

export enum OBJECT_TYPE {
    Structure = 0,
    Player = 1,
    Entity = 2,
}

export namespace PACKET {
    export type ANY =
        | MOVE_OBJECT
        | NEW_PLAYER
        | UPDATE_PLAYER_GEAR
        | NEW_STRUCTURE;

    export type NEW_STRUCTURE = [
        id: number,
        type: number,
        x: number,
        y: number,
        rotation: number,
        size: number
    ];

    export type MOVE_OBJECT = [
        id: number,
        x: number,
        y: number,
        rotation: number
    ];
    export type NEW_PLAYER = [
        id: number,
        name: string,
        x: number,
        y: number,
        rotation: number,
        holding: number,
        helmet: number,
        backpack: number
    ];
    export type UPDATE_PLAYER_GEAR = [
        id: number,
        holding: number,
        helmet: number,
        backpack: number
    ];
    export namespace FULL {
        export type ANY =
            | MOVE_OBJECT
            | NEW_PLAYER
            | UPDATE_PLAYER_GEAR
            | NEW_STRUCTURE;

        export type NEW_STRUCTURE = [
            type: PACKET_TYPE.NEW_STRUCTURE,
            time: number,
            PACKET.NEW_STRUCTURE[]
        ];

        export type MOVE_OBJECT = [
            type: PACKET_TYPE.MOVE_OBJECT,
            time: number,
            PACKET.MOVE_OBJECT[]
        ];
        export type NEW_PLAYER = [
            type: PACKET_TYPE.NEW_PLAYER,
            time: number,
            PACKET.NEW_PLAYER[]
        ];
        export type UPDATE_PLAYER_GEAR = [
            type: PACKET_TYPE.UPDATE_PLAYER_GEAR,
            time: number,
            PACKET.UPDATE_PLAYER_GEAR[]
        ];
    }
}
