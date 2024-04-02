import { z } from "zod";

export enum PACKET_TYPE {
    PING = 0,
    ACTION = 1,
    STARTING_INFO = 99,

    NEW_OBJECT = 100,
    MOVE_OBJECT = 101,
    ROTATE_OBJECT = 102,
    DELETE_OBJECT = 103,
    // UPDATE_PLAYER_GEAR = 201,

    LOAD_GROUND = 301,

    // SET_TIME = 600,
}

export enum ACTION {
    ATTACK = 1,
    BLOCK = 2,
    HURT = 4,
}

export enum OBJECT_CLASS {
    PLAYER = 1,
    ENTITY = 2,
    STRUCTURE = 3,
}

export namespace NewObjectSchema {
    export const newPlayer = z.tuple([
        z.number(), // id
        z.number(), // x
        z.number(), // y
        z.number(), // rot
        z.string(), // name
        z.number().nullable(), // hand
        z.number().nullable(), // helm
        z.number().nullable(), // skin
        z.number().nullable(), // backpackSkin
        z.boolean().nullable(), // hasBackpack
    ]);
    export type newPlayer = z.infer<typeof newPlayer>;

    export const newEntity = z.tuple([
        z.number(), // id
        z.number(), // x
        z.number(), // y
        z.number(), // rot
        z.number(), // size
        z.number(), // type
        z.boolean(), // angry
    ]);
    export type newEntity = z.infer<typeof newEntity>;

    export const newStructure = z.tuple([
        z.number(), // id
        z.number(), // x
        z.number(), // y
        z.number(), // rot
        z.number(), // type
        z.number(), // size
    ]);
    export type newStructure = z.infer<typeof newStructure>;
}

export namespace ServerPacketSchema {
    // length: 0
    export const ping = z.tuple([
        z.number(), // server time
    ]);
    export type ping = z.infer<typeof ping>;

    export const action = z.tuple([
        z.number(), // id
        z.number(), // action
        z.boolean(), //stop
    ]);
    export type action = z.infer<typeof action>;

    export const startingInfo = z.tuple([
        z.number(), // player's id
    ]);
    export type startingInfo = z.infer<typeof startingInfo>;

    export const newObject = z.tuple([
        z.number(), // object class
        z.unknown().array(), // object info
    ]);
    export type newObject = z.infer<typeof newObject>;

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

    // length: 5
    export const loadGround = z.tuple([
        z.number(), // x
        z.number(), // y
        z.number(), // w
        z.number(), // h
        z.number(), // type
    ]);
    export type loadGround = z.infer<typeof loadGround>;
}

export enum CLIENT_PACKET_TYPE {
    PING = 0,
    JOIN = 1,
    MOVE_UPDATE = 20,
    ROTATE = 21,
    ACTION = 22,

    REQUEST_OBJECT = 50,
}

export enum CLIENT_ACTION {
    ATTACK = 1,
    BLOCK = 3,
}

export namespace ClientPacketSchema {
    export const ping = z.tuple([]);
    export type ping = z.infer<typeof ping>;

    export const join = z.tuple([
        z.string(), // name,
        z.number(), // skin
        z.number(), // backpack skin,
        z.number(), // bookskin
    ]);
    export type join = z.infer<typeof join>;

    export const moveUpdate = z.tuple([
        z.number(), // x
        z.number(), // y
    ]);
    export type moveUpdate = z.infer<typeof moveUpdate>;

    export const rotate = z.tuple([
        z.number(), // rotation
    ]);
    export type rotate = z.infer<typeof rotate>;

    export const action = z.tuple([
        z.number(), // ACTION
        z.boolean(), // stop
    ]);
    export type action = z.infer<typeof action>;

    export const requestObjects = z.number().array();
    export type requestObjects = z.infer<typeof requestObjects>;
}
