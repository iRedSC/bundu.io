import { z } from "zod";

export enum PACKET_TYPE {
    PING = 0x00,
    ACTION = 0x01,
    MOVE_OBJECT = 0x02,
    ROTATE_OBJECT = 0x03,
    NEW_OBJECT = 0x04,
    DELETE_OBJECT = 0x05,
    UPDATE_INVENTORY = 0x06,
    UPDATE_GEAR = 0x07,
    CRAFTING_RECIPES = 0x08,

    LOAD_GROUND = 0x09,
    STARTING_INFO = 0x10,
    DRAW_POLYGON = 0x11,
    CHAT_MESSAGE = 0x12,
    UPDATE_STATS = 0x13,

    // SET_TIME = 600,
}

export enum ACTION {
    ATTACK = 0x01,
    BLOCK = 0x02,
    HURT = 0x03,
}

export enum OBJECT_CLASS {
    PLAYER = 0x01,
    ENTITY = 0x02,
    STRUCTURE = 0x03,
}

export namespace NewObjectSchema {
    export const newPlayer = z.tuple([
        z.number(), // id
        z.number(), // x
        z.number(), // y
        z.number(), // rot
        z.string(), // name
        z.number().nullable(), // main hand
        z.number().nullable(), // offhand
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
    export const ping = z.tuple([
        z.number(), // server time
    ]);
    export type ping = z.infer<typeof ping>;

    export const action = z.tuple([
        z.number(), // action
        z.number(), // id
        z.boolean(), //stop
    ]);
    export type action = z.infer<typeof action>;

    export const updateStats = z.tuple([
        z.number(), // health
        z.number(), // hunger
        z.number(), // heat
    ]);
    export type updateStats = z.infer<typeof updateStats>;

    export const startingInfo = z.tuple([
        z.number(), // player's id
    ]);
    export type startingInfo = z.infer<typeof startingInfo>;

    export const newObject = z.tuple([
        z.number(), // object class
        z.unknown().array(), // object info
    ]);
    export type newObject = z.infer<typeof newObject>;

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

    export const loadGround = z.tuple([
        z.number(), // x
        z.number(), // y
        z.number(), // w
        z.number(), // h
        z.number(), // type
    ]);
    export type loadGround = z.infer<typeof loadGround>;

    export const updateInventory = z.tuple([
        z.number(), // slot count;
        z.array(
            z.tuple([
                z.number(), // item id
                z.number(), // count
            ])
        ),
    ]);
    export type updateInventory = z.infer<typeof updateInventory>;

    export const updateGear = z.tuple([
        z.number(), // player id
        z.number(), // mainHand
        z.number(), // offHand
        z.number(), // helmet,
        z.number(), // backpack
    ]);
    export type updateGear = z.infer<typeof updateGear>;

    export const craftingRecipes = z.array(
        z.tuple([
            z.number(), // item id
            z.array(
                z.tuple([
                    z.number(), // required item id
                    z.number(), // required item amount
                ])
            ),
            z.array(
                z.number() // crafting flags
            ),
        ])
    );
    export type craftingRecipes = z.infer<typeof craftingRecipes>;

    export const drawPolygon = z.tuple([
        z.number(), // start x
        z.number(), // start y
        z.array(
            z.tuple([
                z.number(), // x
                z.number(), // y
            ])
        ),
    ]);
    export type drawPolygon = z.infer<typeof drawPolygon>;

    export const chatMessage = z.tuple([
        z.number(), // player id
        z.string(), // message
    ]);
    export type chatMessage = z.infer<typeof chatMessage>;
}

export enum CLIENT_PACKET_TYPE {
    PING = 0x00,
    MOVE_UPDATE = 0x01,
    ROTATE = 0x02,
    ACTION = 0x03,
    REQUEST_OBJECT = 0x04,
    JOIN = 0x05,
    SELECT_ITEM = 0x06,
    CRAFT_ITEM = 0x07,
    CHAT_MESSAGE = 0x08,
    DROP_ITEM = 0x09,
}

export enum CLIENT_ACTION {
    ATTACK = 0x01,
    BLOCK = 0x02,
}

export namespace ClientPacketSchema {
    export const ping = z.undefined();
    export type ping = z.infer<typeof ping>;

    export const join = z.tuple([
        z.string(), // name,
        z.number(), // skin
        z.number(), // backpack skin,
        z.number(), // bookskin
    ]);
    export type join = z.infer<typeof join>;

    export const moveUpdate = z.number();
    export type moveUpdate = z.infer<typeof moveUpdate>;

    export const rotate = z.number(); // rotation
    export type rotate = z.infer<typeof rotate>;

    export const action = z.tuple([
        z.number(), // ACTION
        z.boolean(), // stop
    ]);
    export type action = z.infer<typeof action>;

    export const requestObjects = z.number().array();
    export type requestObjects = z.infer<typeof requestObjects>;

    export const selectItem = z.number();
    export type selectItem = z.infer<typeof selectItem>;

    export const craftItem = z.number();
    export type craftItem = z.infer<typeof craftItem>;

    export const chatMessage = z.string();
    export type chatMessage = z.infer<typeof chatMessage>;

    export const dropItem = z.tuple([
        z.number(), // item id
        z.boolean(), // drop all?
    ]);
    export type dropItem = z.infer<typeof dropItem>;
}
