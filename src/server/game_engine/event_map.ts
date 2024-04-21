import { GameObject } from "./game_object";

export interface GameEventMap {
    attack: undefined;
    block: boolean;

    move: undefined;
    collide: undefined;
    rotate: undefined;

    new_object: undefined;
    send_new_objects: number[];
    send_object_updates: undefined;
    delete_object: undefined;

    spawn_item: {
        id: number;
        amount: number;
    };

    update_inventory: undefined;
    update_gear: [
        mainHand: number,
        offHand: number,
        helmet: number,
        backpack: boolean
    ];

    hurt: {
        source: GameObject;
        damage: number;
    };
    kill: {
        source: GameObject;
    };

    chat_message: string;
    health_update: undefined;

    drop_item: {
        id: number;
        all: boolean;
    };
    craft_item: number;
    select_item: number;
    give_items: [id: number, amount: number][];
}
