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
import { GameEvent, type GameEventMap } from "./event_map.js";

export class PacketSystem extends System<GameEventMap> {
    lastUpdate: number;
    constructor() {
        super([PlayerData], 10);

        this.lastUpdate = 0;

        this.listen(GameEvent.NewObject, this.newObject);
        this.listen(GameEvent.Hurt, this.hurt);
        this.listen(GameEvent.SendNewObjects, this.sendNewObjects, [
            PlayerData,
        ]);
        this.listen(GameEvent.SendObjectUpdates, this.sendUpdatedObjects, [
            PlayerData,
        ]);
        this.listen(GameEvent.DeleteObject, this.deleteObject);

        this.listen(GameEvent.UpdateInventory, this.sendInventory, [
            PlayerData,
        ]);
        this.listen(GameEvent.UpdateEquipment, this.updateGear, [PlayerData]);

        this.listen(GameEvent.ChatMessage, this.chatMessage, [PlayerData]);

        this.listen(GameEvent.HealthUpdate, this.healthUpdate, [PlayerData]);
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
                this.trigger(GameEvent.SendObjectUpdates, { object: player });
        }
        if (this.lastUpdate < Date.now()) this.lastUpdate = Date.now() + 1000;
    }

    newObject({ object: target }: GameEvent.NewObject) {
        const objPhys = Physics.get(target);
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
                data.visibleObjects.add(target.id);
                target.sendNewObjectPacket();
            }
        }
    }

    deleteObject({ objects: target }: GameEvent.DeleteObject) {
        const players = this.world.query([PlayerData]);
        for (const player of players) {
            playerPacketManager.set(player.id, ServerPacket.DeleteObjects, {
                objects: [target.id],
            });
        }
    }

    sendNewObjects({ object: target, objects }: GameEvent.SendNewObjects) {
        if (!objects) return;
        const foundObjects = this.world.query([], objects);

        for (const object of foundObjects) {
            object.sendNewObjectPacket(target.id);
            console.log(`Sent data for object ${object.id}`);
        }
    }

    sendUpdatedObjects({ object: target }: GameEvent.SendObjectUpdates) {
        console.log("sending object updates");
        const data = target.get(PlayerData);
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
    }

    sendInventory({ object: target }: GameEvent.UpdateInventory) {
        const inventory = target.get(Inventory);
        playerPacketManager.set(target.id, ServerPacket.UpdateInventory, {
            items: Array.from(inventory.items.entries()),
        });
    }

    updateGear({
        object: target,
        mainhand,
        offhand,
        helmet,
        backpack,
    }: GameEvent.UpdateEquipment) {
        const data = PlayerData.get(target);
        if (!data) return;

        worldPacketManager.add(ServerPacket.UpdateEquipment, {
            id: target.id,
            mainhand,
            offhand,
            helmet,
            backpack,
        });
    }

    hurt({ object: target, source }: GameEvent.Hurt) {
        if (target.id === source?.id) return;
        worldPacketManager.add(ServerPacket.HitEvent, {
            id: target.id,
            angle: 0,
        });
    }

    chatMessage({ object: target, message }: GameEvent.ChatMessage) {
        worldPacketManager.add(ServerPacket.ChatMessage, {
            id: target.id,
            message,
        });
    }

    healthUpdate({ object: target }: GameEvent.HealthUpdate) {
        const stats = target.get(Stats);
        const health = target.get(Health);
        playerPacketManager.set(target.id, ServerPacket.UpdateVitals, {
            health: health.value,
            hunger: stats.get("hunger").value,
            heat: stats.get("temperature").value,
        });
    }
}
