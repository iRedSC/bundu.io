import { Range } from "@ioengine/lib";
import { Health, Physics } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { Inventory } from "../components/inventory.js";
import { GameObject, System } from "@ioengine/server";

import { getSizedBounds, quadtree } from "./position.js";
import { Stats } from "../components/stats.js";
import {
    playerPacketManager,
    worldPacketManager,
} from "../network/managers.js";
import { ServerPacket } from "@shared/packet_definitions.js";
import type { EventCallback, GameEventMap } from "./event_map.js";

export class PacketSystem extends System<GameEventMap> {
    lastUpdate: number;
    constructor() {
        super([PlayerData], 10);

        this.lastUpdate = 0;

        this.listen("new_object", this.newObject);
        this.listen("hurt", this.hurt);
        this.listen("send_new_objects", this.sendNewObjects, [PlayerData]);
        this.listen("send_object_updates", this.sendUpdatedObjects, [
            PlayerData,
        ]);
        this.listen("delete_object", this.deleteObject);

        this.listen("update_inventory", this.sendInventory, [PlayerData]);
        this.listen("update_equipment", this.updateGear, [PlayerData]);

        this.listen("chat_message", this.chatMessage, [PlayerData]);

        this.listen("health_update", this.healthUpdate, [PlayerData]);
    }

    public override afterUpdate(time: number, players: GameObject[]): void {
        for (const player of players) {
            if (this.lastUpdate > Date.now()) continue;

            const data = PlayerData.get(player);
            const physics = Physics.get(player);
            if (!physics) return;

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

            if (unload.length > 0)
                playerPacketManager.set(player.id, ServerPacket.UnloadObjects, {
                    objects: unload,
                });

            if (data.visibleObjects.new.size > 0)
                this.trigger("send_object_updates", player.id);
        }
        if (this.lastUpdate < Date.now()) this.lastUpdate = Date.now() + 1000;
    }

    newObject: EventCallback<"new_object"> = (object: GameObject) => {
        const objPhys = Physics.get(object);
        if (!objPhys) return;
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
                object.sendNewObjectPacket();
            }
        }
    };

    deleteObject: EventCallback<"delete_object"> = (object: GameObject) => {
        const players = this.world.query([PlayerData]);
        for (const player of players) {
            playerPacketManager.set(player.id, ServerPacket.DeleteObjects, {
                objects: [object.id],
            });
        }
    };

    sendNewObjects: EventCallback<"send_new_objects"> = (
        player: GameObject,
        objects?: number[]
    ) => {
        if (!objects) return;
        const foundObjects = this.world.query([], objects);

        for (const object of foundObjects) {
            object.sendNewObjectPacket(player.id);
            console.log(`Sent data for object ${object.id}`);
        }
    };

    sendUpdatedObjects: EventCallback<"send_object_updates"> = (
        player: GameObject
    ) => {
        console.log("sending object updates");
        const data = player.get(PlayerData);
        const newObjects = data.visibleObjects.getNew();
        const objects = this.world.query([], newObjects);
        for (const object of objects) {
            const physics = object.get(Physics);
            worldPacketManager.add(ServerPacket.SetPosition, {
                id: object.id,
                x: physics.position.x,
                y: physics.position.y,
            });
            worldPacketManager.add(ServerPacket.SetRotation, {
                id: object.id,
                rotation: physics.rotation,
            });
        }
        data.visibleObjects.clear();
    };

    sendInventory: EventCallback<"update_inventory"> = (player: GameObject) => {
        const inventory = player.get(Inventory);
        playerPacketManager.set(player.id, ServerPacket.UpdateInventory, {
            items: Array.from(inventory.items.entries()),
        });
    };

    updateGear: EventCallback<"update_equipment"> = (player, items) => {
        const data = PlayerData.get(player);
        if (!data) return;

        worldPacketManager.add(ServerPacket.UpdateEquipment, {
            id: player.id,
            mainhand: items[0],
            offhand: items[1],
            helmet: items[2],
            backpack: items[3],
        });
    };

    hurt: EventCallback<"hurt"> = (object: GameObject, { source }) => {
        if (object.id === source?.id) return;
        worldPacketManager.add(ServerPacket.HitEvent, {
            id: object.id,
            angle: 0,
        });
    };

    chatMessage: EventCallback<"chat_message"> = (
        object: GameObject,
        message: string
    ) => {
        worldPacketManager.add(ServerPacket.ChatMessage, {
            id: object.id,
            message,
        });
    };

    healthUpdate: EventCallback<"health_update"> = (player: GameObject) => {
        const stats = player.get(Stats);
        const health = player.get(Health);
        playerPacketManager.set(player.id, ServerPacket.UpdateVitals, {
            health: health.value,
            hunger: stats.get("hunger").value,
            heat: stats.get("temperature").value,
        });
    };
}
