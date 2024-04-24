import { Range } from "../../lib/quadtree.js";
import { moveToward } from "../../lib/transforms.js";
import { PACKET } from "../../shared/enums.js";
import { Physics } from "../components/base.js";
import { Health } from "../components/combat.js";
import { PlayerData } from "../components/player.js";
import { Inventory } from "../components/inventory.js";
import { GameObject } from "../game_engine/game_object.js";
import { EventCallback, System } from "../game_engine/system.js";
import { UpdateHandler } from "../game_objects/update_handler.js";
import { GlobalPacketFactory } from "../globals.js";
import { getSizedBounds, quadtree } from "./position.js";

export const updateHandler = new UpdateHandler();

export class PacketSystem extends System {
    lastUpdate: number;
    constructor() {
        super([PlayerData], 10);

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

            // for (const object of this.world.query([Physics], nearby)) {
            //     if (object.id === player.id) {
            //         continue;
            //     }
            //     const objPhys = object.get(Physics);
            //     const newPos = moveToward(
            //         objPhys.position,
            //         physics.position,
            //         3
            //     );
            //     objPhys.position.x = newPos.x;
            //     objPhys.position.y = newPos.y;
            // }
            // this.trigger("move", nearby);

            if (unload.length > 0) {
                GlobalPacketFactory.add(
                    player.id,
                    [PACKET.SERVER.UNLOAD_OBJECT],
                    () => unload
                );
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
                updateHandler.add(object, [PACKET.SERVER.NEW_OBJECT]);
            }
        }
    };

    moveObject: EventCallback<"move" | "collide"> = (object: GameObject) => {
        updateHandler.add(object, [PACKET.SERVER.MOVE_OBJECT]);
    };

    rotateObject: EventCallback<"rotate"> = (object: GameObject) => {
        updateHandler.add(object, [PACKET.SERVER.ROTATE_OBJECT]);
    };
    deleteObject: EventCallback<"delete_object"> = (object: GameObject) => {
        const players = this.world.query([PlayerData]);
        for (const player of players) {
            const data = PlayerData.get(player);
            if (!data) {
                continue;
            }
            GlobalPacketFactory.add(
                player.id,
                [PACKET.SERVER.DELETE_OBJECT],
                () => object.id
            );
        }
    };

    blocking: EventCallback<"block"> = (object: GameObject, stop: boolean) => {
        const players = this.world.query([PlayerData]);
        for (const player of players) {
            const data = PlayerData.get(player);
            if (!data) {
                continue;
            }
            GlobalPacketFactory.add(
                player.id,
                [PACKET.SERVER.EVENT, PACKET.EVENT.BLOCK],
                () => [object.id, stop]
            );
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
            GlobalPacketFactory.add(
                player.id,
                [PACKET.SERVER.EVENT, PACKET.EVENT.ATTACK],
                () => object.id
            );
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

        updateHandler.send(player, [foundObjects, [PACKET.SERVER.NEW_OBJECT]]);
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
                PACKET.SERVER.MOVE_OBJECT,
                PACKET.SERVER.ROTATE_OBJECT,
                PACKET.SERVER.UPDATE_GEAR,
            ],
        ]);
        data.visibleObjects.clear();
    };

    sendInventory: EventCallback<"update_inventory"> = (player: GameObject) => {
        const inventory = player.get(Inventory);
        GlobalPacketFactory.add(
            player.id,
            [PACKET.SERVER.UPDATE_INVENTORY],
            () => [inventory.slots, Array.from(inventory.items.entries())]
        );
    };

    updateGear: EventCallback<"update_gear"> = (player, items) => {
        const data = PlayerData.get(player);
        if (!data) {
            return;
        }
        const players = this.world.query([PlayerData]);
        for (let other of players) {
            const othersData = PlayerData.get(other);
            if (othersData.visibleObjects.has(player.id)) {
                GlobalPacketFactory.add(
                    other.id,
                    [PACKET.SERVER.UPDATE_GEAR],
                    () => [player.id, ...items]
                );
            }
        }
    };

    hurt: EventCallback<"hurt"> = (object: GameObject, { source }) => {
        if (object.id === source?.id) {
            return;
        }
        const players = this.world.query([PlayerData]);
        for (let player of players) {
            const data = PlayerData.get(player);
            if (data.visibleObjects.has(object.id)) {
                GlobalPacketFactory.add(
                    player.id,
                    [PACKET.SERVER.EVENT, PACKET.EVENT.HURT],
                    () => object.id
                );
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
                GlobalPacketFactory.add(
                    player.id,
                    [PACKET.SERVER.CHAT_MESSAGE],
                    () => [object.id, message]
                );
            }
        }
    };

    healthUpdate: EventCallback<"health_update"> = (player: GameObject) => {
        const health = Health.get(player);
        GlobalPacketFactory.add(player.id, [PACKET.SERVER.UPDATE_STATS], () => [
            health.value,
            0,
            0,
        ]);
    };
}
