import { Range } from "../../lib/quadtree.js";
import { ACTION, PACKET_TYPE } from "../../shared/enums.js";
import { Physics } from "../components/base.js";
import { Health } from "../components/combat.js";
import { Inventory, PlayerData } from "../components/player.js";
import { GameObject } from "../game_engine/game_object.js";
import { EventCallback, System } from "../game_engine/system.js";
import { UpdateHandler } from "../game_objects/update_handler.js";
import { send } from "../network/send.js";
import { getSizedBounds, quadtree } from "./position.js";

export const updateHandler = new UpdateHandler();

export class PacketSystem extends System {
    lastUpdate: number;
    constructor() {
        super([PlayerData], 20);

        this.lastUpdate = 0;

        this.listen("new_object", this.newObject);
        this.listen("move", this.moveObject);
        this.listen("hurt", this.hurt);
        this.listen("collide", this.moveObject);
        this.listen("block", this.blocking);
        this.listen("attack", this.attack);
        this.listen("rotate", this.rotateObject);
        this.listen("send_new_objects", this.sendNewObjects, [PlayerData]);
        this.listen("send_object_updates", this.sendUpdatedObjects, [
            PlayerData,
        ]);
        this.listen("delete_object", this.deleteObject);

        this.listen("update_inventory", this.sendInventory, [PlayerData]);
        this.listen("update_gear", this.updateGear, [PlayerData]);

        this.listen("chat_message", this.chatMessage, [PlayerData]);

        this.listen("health_update", this.healthUpdate, [PlayerData]);
    }

    public afterUpdate(time: number, players: GameObject[]): void {
        for (const player of players) {
            updateHandler.send(player);

            if (this.lastUpdate > Date.now()) {
                continue;
            }

            const data = PlayerData.get(player);
            const physics = Physics.get(player);
            if (!physics) {
                return;
            }
            const bounds = getSizedBounds(physics.position, 1600, 900);
            const nearby = quadtree.query(bounds);
            const unload = data.visibleObjects.update(nearby);

            if (unload.length > 0) {
                send(data.socket, [PACKET_TYPE.UNLOAD_OBJECT, unload]);
            }
            if (data.visibleObjects.new.size > 0) {
                this.trigger("send_object_updates", player.id);
            }
        }
        if (this.lastUpdate < Date.now()) {
            this.lastUpdate = Date.now() + 1000;
        }
        updateHandler.clear();
    }

    newObject: EventCallback<"new_object"> = (object: GameObject) => {
        const objPhys = Physics.get(object);
        if (!objPhys) {
            return;
        }
        const players = this.world.query([PlayerData]);
        for (const player of players) {
            const data = PlayerData.get(player);
            const physics = Physics.get(player);

            const bounds = new Range(
                {
                    x: physics.position.x - 1600,
                    y: physics.position.y - 900,
                },
                {
                    x: physics.position.x + 1600,
                    y: physics.position.y + 900,
                }
            );

            if (bounds.contains(objPhys.position)) {
                data.visibleObjects.add(object.id);
                updateHandler.add(object, [PACKET_TYPE.NEW_OBJECT]);
            }
        }
    };

    moveObject: EventCallback<"move" | "collide"> = (object: GameObject) => {
        updateHandler.add(object, [PACKET_TYPE.MOVE_OBJECT]);
    };

    rotateObject: EventCallback<"rotate"> = (object: GameObject) => {
        updateHandler.add(object, [PACKET_TYPE.ROTATE_OBJECT]);
    };
    deleteObject: EventCallback<"delete_object"> = (object: GameObject) => {
        const players = this.world.query([PlayerData]);
        for (const player of players) {
            const data = PlayerData.get(player);
            if (!data) {
                continue;
            }
            send(data.socket, [PACKET_TYPE.DELETE_OBJECT, object.id]);
        }
    };

    blocking: EventCallback<"block"> = (object: GameObject, stop: boolean) => {
        const players = this.world.query([PlayerData]);
        for (const player of players) {
            const data = PlayerData.get(player);
            if (!data) {
                continue;
            }
            send(data.socket, [
                PACKET_TYPE.ACTION,
                [ACTION.BLOCK, object.id, stop],
            ]);
        }
    };

    attack: EventCallback<"attack"> = (object: GameObject) => {
        const players = this.world.query([PlayerData]);
        for (const player of players) {
            const data = PlayerData.get(player);
            if (!data) {
                continue;
            }
            if (!data.visibleObjects.has(object.id)) {
                continue;
            }
            send(data.socket, [
                PACKET_TYPE.ACTION,
                [ACTION.ATTACK, object.id, false],
            ]);
        }
    };

    sendNewObjects: EventCallback<"send_new_objects"> = (
        player: GameObject,
        objects?: number[]
    ) => {
        if (!objects) {
            return;
        }
        const foundObjects = this.world.query([], objects);

        updateHandler.send(player, [foundObjects, [PACKET_TYPE.NEW_OBJECT]]);
    };

    sendUpdatedObjects: EventCallback<"send_object_updates"> = (
        player: GameObject
    ) => {
        const data = player.get(PlayerData);
        const newObjects = data.visibleObjects.getNew();
        const objects = this.world.query([], newObjects);
        updateHandler.send(player, [
            objects,
            [
                PACKET_TYPE.MOVE_OBJECT,
                PACKET_TYPE.ROTATE_OBJECT,
                PACKET_TYPE.UPDATE_GEAR,
            ],
        ]);
        data.visibleObjects.clear();
    };

    sendInventory: EventCallback<"update_inventory"> = (player: GameObject) => {
        const data = player.get(PlayerData);
        if (!data) {
            return;
        }
        const inventory = player.get(Inventory);
        send(data.socket, [
            PACKET_TYPE.UPDATE_INVENTORY,
            [inventory.slots, Array.from(inventory.items.entries())],
        ]);
    };

    updateGear: EventCallback<"update_gear"> = (player, items) => {
        const data = PlayerData.get(player);
        if (!data) {
            return;
        }
        const players = this.world.query([PlayerData]);
        for (let other of players) {
            const data = PlayerData.get(other);
            if (data.visibleObjects.has(player.id)) {
                const data = PlayerData.get(other);
                send(data.socket, [
                    PACKET_TYPE.UPDATE_GEAR,
                    [player.id, ...items],
                ]);
            }
        }
    };

    hurt: EventCallback<"hurt"> = (object: GameObject, { source }) => {
        if (object.id === source.id) {
            return;
        }
        const packet: any[] = [
            PACKET_TYPE.ACTION,
            [ACTION.HURT, object.id, false],
        ];
        const players = this.world.query([PlayerData]);
        for (let player of players) {
            const data = PlayerData.get(player);
            if (data.visibleObjects.has(object.id)) {
                const data = PlayerData.get(player);
                send(data?.socket, packet);
            }
        }
    };

    chatMessage: EventCallback<"chat_message"> = (
        object: GameObject,
        message: string
    ) => {
        const players = this.world.query([PlayerData]);
        for (let player of players) {
            const data = PlayerData.get(player);
            if (data.visibleObjects.has(object.id)) {
                const data = PlayerData.get(player);
                send(data?.socket, [
                    PACKET_TYPE.CHAT_MESSAGE,
                    [object.id, message],
                ]);
            }
        }
    };

    healthUpdate: EventCallback<"health_update"> = (player: GameObject) => {
        const health = Health.get(player);
        const data = PlayerData.get(player);
        send(data?.socket, [PACKET_TYPE.UPDATE_STATS, [health.value, 0, 0]]);
    };
}
