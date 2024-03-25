import { z } from "zod";

export enum PACKET_TYPE {
    PING = 0,
    STARTING_INFO = 99,

    MOVE_OBJECT = 100,
    ROTATE_OBJECT = 101,
    DELETE_OBJECT = 102,

    NEW_PLAYER = 200,
    // UPDATE_PLAYER_GEAR = 201,

    NEW_STRUCTURE = 300,
    LOAD_GROUND = 301,

    // SET_TIME = 600,

    NEW_ENTITY = 700,
}

export namespace Schemas {
    // length: 0
    export const ping = z.tuple([
        z.number(), // server time
    ]);
    export type ping = z.infer<typeof ping>;

    // length: 9
    export const newPlayer = z.tuple([
        z.number(), // id
        z.number(), // x
        z.number(), // y
        z.number(), // rot
        z.string(), // name
        z.number(), // hand
        z.number(), // helm
        z.number(), // skin
        z.number(), // backpack
    ]);
    export type newPlayer = z.infer<typeof newPlayer>;

    export const startingInfo = z.tuple([
        z.number(), // player's id
    ]);
    export type startingInfo = z.infer<typeof startingInfo>;

    // length: 5
    export const moveObject = z.tuple([
        z.number(), // id
        z.number(), // time
        z.number(), // x
        z.number(), // y
    ]);
    export type moveObject = z.infer<typeof moveObject>;

    export const rotateObject = z.tuple([
        z.number(), // id
        z.number(), // rotation
    ]);
    export type rotateObject = z.infer<typeof rotateObject>;

    export const deleteObject = z.tuple([
        z.number(), // id
    ]);
    export type deleteObject = z.infer<typeof deleteObject>;

    // length: 6
    export const newEntity = z.tuple([
        z.number(), // id
        z.number(), // x
        z.number(), // y
        z.number(), // rot
        z.number(), // type
        z.boolean(), // angry
    ]);
    export type newEntity = z.infer<typeof newEntity>;

    // length 6
    export const newStructure = z.tuple([
        z.number(), // id
        z.number(), // x
        z.number(), // y
        z.number(), // rot
        z.number(), // type
        z.number(), // size
    ]);
    export type newStructure = z.infer<typeof newStructure>;

    // length: 5
    export const loadGround = z.tuple([
        z.number(), // x1
        z.number(), // y1
        z.number(), // x2
        z.number(), // y2
        z.number(), // type
    ]);
    export type loadGround = z.infer<typeof loadGround>;
}

export enum CLIENT_PACKET_TYPE {
    PING = 0,
    MOVE_UPDATE = 1,
    ROTATE = 2,
}

export namespace ClientSchemas {
    export const ping = z.tuple([]);

    export const moveUpdate = z.tuple([
        z.number(), // x
        z.number(), // y
    ]);
    export type moveUpdate = z.infer<typeof moveUpdate>;

    export const rotate = z.tuple([
        z.number(), // rotation
    ]);
    export type rotate = z.infer<typeof rotate>;
}
