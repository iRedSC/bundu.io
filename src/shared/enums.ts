export enum PACKET_TYPE {
    MOVE_OBJECT = 100,

    NEW_PLAYER = 200,
    UPDATE_PLAYER_GEAR = 201,

    NEW_STRUCTURE = 300,
    LOAD_GROUND = 301,

    SET_TIME = 600,

    NEW_ENTITY = 700,
}

export namespace PACKET {
    export type ANY =
        | MOVE_OBJECT
        | NEW_PLAYER
        | UPDATE_PLAYER_GEAR
        | NEW_STRUCTURE
        | NEW_ENTITY
        | SET_TIME
        | LOAD_GROUND;

    export type LOAD_GROUND = [
        id: number,
        type: number,
        x1: number,
        y1: number,
        x2: number,
        y2: number
    ];

    export type SET_TIME = [time: number];

    export type NEW_STRUCTURE = [
        id: number,
        type: number,
        x: number,
        y: number,
        rotation: number,
        size: number
    ];

    export type NEW_ENTITY = [
        id: number,
        type: number,
        x: number,
        y: number,
        rotation: number,
        size: number,
        speed: number
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
}
