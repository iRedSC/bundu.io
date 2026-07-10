import { Health } from "../components/base.js";
import { Inventory } from "../components/inventory.js";
import { System, type World } from "../engine";
import { Stats } from "../components/stats.js";
import {
    playerPacketManager,
    worldPacketManager,
} from "../network/managers.js";
import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { PlayerData } from "../components/player.js";

/**
 * Bridges game events to outbound packets.
 * Keep this thin — prefer sending from the system that owns the logic when adding features.
 */
export class PacketSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [PlayerData], 10);

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
    }

    objectsAddedToView({
        object: player,
        objectsAdded,
    }: GameEvent.ObjectsAddedToView) {
        for (const object of objectsAdded) {
            const packet = object.getNewObjectPacket();
            if (!packet) continue;
            playerPacketManager.add(player.id, ServerPacket.LoadObject, packet);
        }
    }

    objectsRemovedFromView({
        object: player,
        objectsRemoved,
    }: GameEvent.ObjectsRemovedFromView) {
        playerPacketManager.add(player.id, ServerPacket.DeleteObjects, {
            objects: objectsRemoved.map((o) => o.id),
        });
    }

    sendInventory({ object: target }: GameEvent.UpdateInventory) {
        const inventory = target.get(Inventory);
        const items: ([number, number] | null)[] = Array(inventory.slots).fill(
            null
        );
        let slot = 0;
        for (const [itemId, count] of inventory.items) {
            if (slot >= inventory.slots) break;
            items[slot++] = [itemId, count];
        }
        playerPacketManager.set(target.id, ServerPacket.UpdateInventory, {
            items,
        });
    }

    updateGear({
        object: target,
        mainhand,
        offhand,
        helmet,
        backpack,
    }: GameEvent.UpdateEquipment) {
        if (!PlayerData.get(target)) return;

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
