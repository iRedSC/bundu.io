import { z } from "zod";

export namespace PACKET {
    export enum SERVER {
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
        UNLOAD_OBJECT = 0x14,
    }

    export enum EVENT {
        ATTACK = 0x01,
        BLOCK = 0x02,
        HURT = 0x03,
    }

    export enum CLIENT {
        PING = 0x00,
        MOVE_UPDATE = 0x01,
        ROTATE = 0x02,
        ACTION = 0x03,
        REQUEST_OBJECTS = 0x04,
        JOIN = 0x05,
        SELECT_ITEM = 0x06,
        CRAFT_ITEM = 0x07,
        CHAT_MESSAGE = 0x08,
        DROP_ITEM = 0x09,
    }

    export enum ACTION {
        ATTACK = 0x01,
        BLOCK = 0x02,
    }
}

export enum OBJECT_CLASS {
    PLAYER = 0x01,
    ENTITY = 0x02,
    STRUCTURE = 0x03,
    POND = 0x04,
}

export namespace SCHEMA {
    export namespace NEW_OBJECT {
        export const PLAYER = z.tuple([
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
        export type PLAYER = z.infer<typeof PLAYER>;

        export const ENTITY = z.tuple([
            z.number(), // id
            z.number(), // x
            z.number(), // y
            z.number(), // rot
            z.number(), // size
            z.number(), // type
            z.boolean(), // angry
        ]);
        export type ENTITY = z.infer<typeof ENTITY>;

        export const STRUCTURE = z.tuple([
            z.number(), // id
            z.number(), // x
            z.number(), // y
            z.number(), // rot
            z.number(), // type
            z.number(), // size
        ]);
        export type STRUCTURE = z.infer<typeof STRUCTURE>;

        export const POND = z.tuple([
            z.number(), // id
            z.number(), // x
            z.number(), // y
            z.number(), // size
        ]);
        export type POND = z.infer<typeof POND>;
    }

    export namespace SERVER {
        export const PING = z.tuple([
            z.number(), // server time
        ]);
        export type PING = z.infer<typeof PING>;

        export const EVENT = z.tuple([
            z.number(), // action
            z.number(), // id
            z.boolean(), //stop
        ]);
        export type EVENT = z.infer<typeof EVENT>;

        export const UPDATE_STATS = z.tuple([
            z.number(), // health
            z.number(), // hunger
            z.number(), // heat
        ]);
        export type UPDATE_STATS = z.infer<typeof UPDATE_STATS>;

        export const UNLOAD_OBJECT = z.number();
        export type UNLOAD_OBJECT = z.infer<typeof UNLOAD_OBJECT>;

        export const STARTING_INFO = z.tuple([
            z.number(), // player's id
        ]);
        export type STARTING_INFO = z.infer<typeof STARTING_INFO>;

        export const NEW_OBJECT = z.tuple([
            z.number(), // object class
            z.unknown().array(), // object info
        ]);
        export type NEW_OBJECT = z.infer<typeof NEW_OBJECT>;

        export const MOVE_OBJECT = z.tuple([
            z.number(), // id
            z.number(), // time
            z.number(), // x
            z.number(), // y
        ]);
        export type MOVE_OBJECT = z.infer<typeof MOVE_OBJECT>;

        export const ROTATE_OBJECT = z.tuple([
            z.number(), // id
            z.number(), // rotation
        ]);
        export type ROTATE_OBJECT = z.infer<typeof ROTATE_OBJECT>;

        export const DELETE_OBJECT = z.number(); // id
        export type DELETE_OBJECT = z.infer<typeof DELETE_OBJECT>;

        export const LOAD_GROUND = z.tuple([
            z.number(), // x
            z.number(), // y
            z.number(), // w
            z.number(), // h
            z.number(), // type
        ]);
        export type LOAD_GROUND = z.infer<typeof LOAD_GROUND>;

        export const UPDATE_INVENTORY = z.tuple([
            z.number(), // slot count;
            z.array(
                z.tuple([
                    z.number(), // item id
                    z.number(), // count
                ])
            ),
        ]);
        export type UPDATE_INVENTORY = z.infer<typeof UPDATE_INVENTORY>;

        export const UPDATE_GEAR = z.tuple([
            z.number(), // player id
            z.number(), // mainHand
            z.number(), // offHand
            z.number(), // helmet,
            z.boolean(), // backpack
        ]);
        export type UPDATE_GEAR = z.infer<typeof UPDATE_GEAR>;

        export const CRAFTING_RECIPES = z.array(
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
        export type CRAFTING_RECIPES = z.infer<typeof CRAFTING_RECIPES>;

        export const DRAW_POLYGON = z.tuple([
            z.number(), // start x
            z.number(), // start y
            z.array(
                z.tuple([
                    z.number(), // x
                    z.number(), // y
                ])
            ),
        ]);
        export type DRAW_POLYGON = z.infer<typeof DRAW_POLYGON>;

        export const CHAT_MESSAGE = z.tuple([
            z.number(), // player id
            z.string(), // message
        ]);
        export type CHAT_MESSAGE = z.infer<typeof CHAT_MESSAGE>;
    }

    export namespace CLIENT {
        export const PING = z.undefined();
        export type PING = z.infer<typeof PING>;

        export const JOIN = z.tuple([
            z.string(), // name,
            z.number(), // skin
            z.number(), // backpack skin,
            z.number(), // bookskin
        ]);
        export type JOIN = z.infer<typeof JOIN>;

        export const MOVE_UPDATE = z.number();
        export type MOVE_UPDATE = z.infer<typeof MOVE_UPDATE>;

        export const ROTATE = z.number(); // rotation
        export type ROTATE = z.infer<typeof ROTATE>;

        export const ACTION = z.tuple([
            z.number(), // ACTION
            z.boolean(), // stop
        ]);
        export type ACTION = z.infer<typeof ACTION>;

        export const REQUEST_OBJECTS = z.number().array();
        export type REQUEST_OBJECTS = z.infer<typeof REQUEST_OBJECTS>;

        export const SELECT_ITEM = z.number();
        export type SELECT_ITEM = z.infer<typeof SELECT_ITEM>;

        export const CRAFT_ITEM = z.number();
        export type CRAFT_ITEM = z.infer<typeof CRAFT_ITEM>;

        export const CHAT_MESSAGE = z.string();
        export type CHAT_MESSAGE = z.infer<typeof CHAT_MESSAGE>;

        export const DROP_ITEM = z.tuple([
            z.number(), // item id
            z.boolean(), // drop all?
        ]);
        export type DROP_ITEM = z.infer<typeof DROP_ITEM>;
    }
}
