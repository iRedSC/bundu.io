import { z } from "zod";

export enum PACKET_TYPE {
    MOVE_OBJECT = 100,

    NEW_PLAYER = 200,
    UPDATE_PLAYER_GEAR = 201,

    NEW_STRUCTURE = 300,
    LOAD_GROUND = 301,

    SET_TIME = 600,

    NEW_ENTITY = 700,
}

export namespace Schemas {
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

    // length: 5
    export const moveObject = z.tuple([
        z.number(), // id
        z.number(), // time
        z.number(), // x
        z.number(), // y
        z.number(), // rot
    ]);
    export type moveObject = z.infer<typeof moveObject>;

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
