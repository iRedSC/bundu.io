import {
    Schema,
    ServerPacket,
    type ServerPacketMap,
} from "@shared/packet_definitions";
import { ClientPacketReceiver } from "./client_receiver";
import { Serializer } from "@ioengine/client";
import type { World } from "../world/world";
import type { UI } from "../ui/ui";
import { drawPolygon } from "@client/rendering/debug";
import { serverTime } from "@client/globals";

const serverSerializer = new Serializer<typeof Schema.Server, ServerPacketMap>(
    Schema.Server
);
export const receiver = new ClientPacketReceiver<
    typeof Schema.Server,
    ServerPacketMap
>(serverSerializer);

export function setupPacketReceiving(
    receiver: ClientPacketReceiver<typeof Schema.Server, ServerPacketMap>,
    world: World
) {
    receiver.on(ServerPacket.LoadPlayer, world.newPlayer);
    receiver.on(ServerPacket.AttackEvent, world.attack);
    receiver.on(ServerPacket.BlockEvent, world.block);
    receiver.on(ServerPacket.HitEvent, world.hurt);
    receiver.on(ServerPacket.SetPosition, world.moveObject);
    receiver.on(ServerPacket.SetRotation, world.rotateObject);
    receiver.on(ServerPacket.DeleteObjects, world.deleteObjects);
    receiver.on(ServerPacket.LoadGround, world.loadGround);
    receiver.on(ServerPacket.ClientConnectionInfo, world.clientConnectionInfo);
    receiver.on(ServerPacket.UpdateEquipment, world.updateEquipment);
    receiver.on(ServerPacket.ChatMessage, world.chatMessage);
    receiver.on(ServerPacket.UnloadObjects, world.unloadObject);
    receiver.on(ServerPacket.SetSelectedStructure, world.selectStructure);
    receiver.on(ServerPacket.Ping, (_, now) => {
        serverTime.ping = (performance.now() - serverTime.pingTimeStart) / 2;

        const newOffset = now - performance.now();
        const drift = Math.abs(newOffset - serverTime.offset);
        if (drift > 50) {
            serverTime.targetOffset = newOffset;
        } else {
            serverTime.offset = newOffset;
        }
        serverTime.offset = now - performance.now();

        console.log(`timeoffset ${serverTime.now() - now} ${serverTime.ping}`);
    });

    // receiver.on(ServerPacket.Ping)
}

export function setupGUIPacketReceiving(
    receiver: ClientPacketReceiver<typeof Schema.Server, ServerPacketMap>,
    ui: UI
) {
    receiver.on(ServerPacket.DebugDrawPolygon, drawPolygon);
    receiver.on(ServerPacket.UpdateVitals, ({ health, hunger, heat }) => {
        ui.health.update(health);
        ui.hunger.update(hunger);
        ui.heat.update(heat);
    });
    receiver.on(
        ServerPacket.RecipeList,
        ui.recipeManager.updateRecipes.bind(ui.recipeManager)
    );
    receiver.on(ServerPacket.UpdateInventory, ({ items }) => {
        ui.inventory.update({ items });
        ui.craftingMenu.items = ui.recipeManager.filter(ui.inventory.items, []);
        ui.craftingMenu.update();
    });
}
