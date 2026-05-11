import { Health } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { Inventory } from "../components/inventory.js";
import { System } from "@ioengine/server";
import { Stats } from "../components/stats.js";
import {
    playerPacketManager,
    worldPacketManager,
} from "../network/managers.js";
import { ServerPacket } from "@shared/packet_definitions.js";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { quadtree } from "./position.js";

export class PacketSystem extends System<GameEventMap> {
    lastUpdate: number;
    constructor() {
        super([PlayerData], 10);

        this.lastUpdate = 0;

        this.listen(GameEvent.Hurt, this.hurt);
        this.listen(GameEvent.ObjectsAddedToView, this.objectsAddedToView);
        this.listen(
            GameEvent.ObjectsRemovedFromView,
            this.objectsRemovedFromView
        );

        this.listen(GameEvent.UpdateInventory, this.sendInventory);
        this.listen(GameEvent.UpdateEquipment, this.updateGear);

        this.listen(GameEvent.ChatMessage, this.chatMessage);

        this.listen(GameEvent.HealthUpdate, this.healthUpdate);

        this.listen(GameEvent.Attack, this.attack);

        this.listen(GameEvent.DebugDrawPolygon, this.debugDrawPolygon);

        setInterval(this.drawQuadtree.bind(this), 1000);
    }

    drawQuadtree() {
        for (const player of this.world.query([PlayerData])) {
            playerPacketManager.set(player.id, ServerPacket.DebugDrawRects, {
                rects: quadtree.tree.serializeRects(),
            });
        }
    }

    debugDrawPolygon(event: GameEvent.DebugDrawPolygon) {
        playerPacketManager.add(
            event.object.id,
            ServerPacket.DebugDrawPolygon,
            event
        );
        // console.log(`Drawing polygon for ${event.object.id}`);
    }

    objectsAddedToView({
        object: player,
        objectsAdded,
    }: GameEvent.ObjectsAddedToView) {
        for (const object of objectsAdded) {
            console.log(`Player ${player.id} has added ${object.id} to view.`);
            const packet = object.getNewObjectPacket();
            if (!packet) continue;
            playerPacketManager.add(player.id, ServerPacket.LoadObject, packet);
        }
    }

    objectsRemovedFromView({
        object: player,
        objectsRemoved,
    }: GameEvent.ObjectsRemovedFromView) {
        console.log(
            `Player ${player.id} has removed ${objectsRemoved
                .map((o) => o.id)
                .join(", ")} from view.`
        );
        playerPacketManager.add(player.id, ServerPacket.DeleteObjects, {
            objects: objectsRemoved.map((o) => o.id),
        });
    }

    attack({ object }: GameEvent.Attack) {
        worldPacketManager.add(ServerPacket.AttackEvent, { id: object.id });
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
