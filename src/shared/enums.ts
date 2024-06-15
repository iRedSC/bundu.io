import { z } from "zod";

export namespace PACKET {
    export const SERVER = {
        ROTATE_OBJECT: 0x00,
        MOVE_OBJECT: 0x01,
        EVENT: 0x02,

        PLACEMENT_VALIDITY: 0x03,

        NEW_OBJECT: 0x04,
        UNLOAD_OBJECT: 0x05,

        UPDATE_STATS: 0x06,
        UPDATE_INVENTORY: 0x07,
        UPDATE_GEAR: 0x08,

        DELETE_OBJECT: 0x09,

        PING: 0x0a,

        DRAW_POLYGON: 0x0b,
        CHAT_MESSAGE: 0x0c,

        LOAD_GROUND: 0x0d,
        STARTING_INFO: 0x0e,
        CRAFTING_RECIPES: 0x0f,
    } as const;
    export type SERVER = (typeof SERVER)[keyof typeof SERVER];

    export const EVENT = {
        ATTACK: 0x01,
        BLOCK: 0x02,
        HURT: 0x03,
    } as const;
    export type EVENT = (typeof EVENT)[keyof typeof EVENT];

    export const CLIENT = {
        ROTATE: 0x00,
        MOVE_UPDATE: 0x01,

        REQUEST_OBJECTS: 0x02,
        REQUEST_PLACEMENT_VALIDITY: 0x03,

        ACTION: 0x04,
        SELECT_ITEM: 0x05,

        PING: 0x06,

        CRAFT_ITEM: 0x07,

        CHAT_MESSAGE: 0x08,

        DROP_ITEM: 0x09,

        PLACE_STRUCTURE: 0x0a,
        JOIN: 0x0b,
    } as const;
    export type CLIENT = (typeof CLIENT)[keyof typeof CLIENT];

    export const ACTION = {
        ATTACK: 0x01,
        BLOCK: 0x02,
    } as const;
    export type ACTION = (typeof ACTION)[keyof typeof ACTION];
}

export const OBJECT_CLASS = {
    PLAYER: 0x01,
    ENTITY: 0x02,
    STRUCTURE: 0x03,
    POND: 0x04,
} as const;
type OBJECT_CLASS = (typeof OBJECT_CLASS)[keyof typeof OBJECT_CLASS];

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
        export type PLAYER = [
            id: number,
            x: number,
            y: number,
            rotation: number,
            name: string,
            mainHand?: number,
            offHand?: number,
            helmet?: number,
            skin?: number,
            backpackSkin?: number,
            hasBackpack?: boolean
        ];

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
    export namespace EVENT {
        export const HURT = z.number(); // id
        export type HURT = z.infer<typeof HURT>;

        export const ATTACK = z.number(); // id
        export type ATTACK = z.infer<typeof ATTACK>;

        export const BLOCK = z.tuple([
            z.number(), // id
            z.boolean(), // stop
        ]);
        export type BLOCK = z.infer<typeof BLOCK>;
    }

    export namespace SERVER {
        export const PING = z.tuple([
            z.number(), // server time
        ]);
        export type PING = z.infer<typeof PING>;

        export const UPDATE_STATS = z.tuple([
            z.number(), // health
            z.number(), // hunger
            z.number(), // heat
        ]);
        export type UPDATE_STATS = z.infer<typeof UPDATE_STATS>;

        export const UNLOAD_OBJECT = z.number().array();
        export type UNLOAD_OBJECT = z.infer<typeof UNLOAD_OBJECT>;

        export const STARTING_INFO = z.tuple([
            z.number(), // player's id
            z.number(), // server start time
        ]);
        export type STARTING_INFO = z.infer<typeof STARTING_INFO>;

        export const NEW_OBJECT = z.tuple([
            z.number(), // object class
            z.unknown().array(), // object info
        ]);
        export type NEW_OBJECT = z.infer<typeof NEW_OBJECT>;

        export const EVENT = z
            .tuple([
                z.number(), // event
            ])
            .rest(z.unknown()); // data;
        export type EVENT = z.infer<typeof EVENT>;

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

        export const PLACEMENT_VALIDITY = z.boolean();
        export type PLACEMENT_VALIDITY = boolean;
    }

    export namespace CLIENT {
        export const PING = z.undefined();
        export type PING = z.infer<typeof PING>;

        export const JOIN = z.tuple([
            z.string(), // name,
            z.number(), // skin
            z.number(), // backpack skin,
        ]);
        export type JOIN = [name: string, skin: number, backpackSkin: number];

        export const MOVE_UPDATE = z.number();
        export type MOVE_UPDATE = z.infer<typeof MOVE_UPDATE>;

        export const ROTATE = z.number(); // rotation
        export type ROTATE = z.infer<typeof ROTATE>;

        export const ACTION = z.tuple([
            z.number(), // ACTION
            z.boolean(), // stop
        ]);
        export type ACTION = [action: number, stop: boolean];

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
        export type DROP_ITEM = [itemId: number, dropAll: boolean];

        export const REQUEST_PLACEMENT_VALIDITY = z.tuple([
            z.number(), // item id
            z.boolean(), // on grid
        ]);
        export type REQUEST_PLACEMENT_VALIDITY = [
            itemId: number,
            onGrid: boolean
        ];

        export const PLACE_STRUCTURE = z.tuple([
            z.number(), // item id
            z.boolean(), // on grid
        ]);
        export type PLACE_STRUCTURE = [itemId: number, onGrid: boolean];
    }
}
