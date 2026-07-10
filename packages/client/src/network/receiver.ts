import {
    Schema,
    ServerPacket,
    type ServerPacketMap,
} from "@bundu/shared/packet_definitions";
import { ClientPacketReceiver } from "./client_receiver";
import { Serializer } from "@bundu/shared";
import type { World } from "../world/world";
import type { UI } from "../ui/ui";
import { drawPolygon, drawRects } from "@client/rendering/debug";

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
    receiver.on(ServerPacket.DebugDrawPolygon, drawPolygon);
    receiver.on(ServerPacket.DebugDrawRects, drawRects);
    receiver.on(ServerPacket.LoadObject, world.loadObject);
    receiver.on(ServerPacket.AttackEvent, world.combatFx.attack);
    receiver.on(ServerPacket.BlockEvent, world.combatFx.block);
    receiver.on(ServerPacket.HitEvent, world.combatFx.hurt);
    receiver.on(ServerPacket.SetPosition, world.moveObject);
    receiver.on(ServerPacket.SetRotation, world.rotateObject);
    receiver.on(ServerPacket.DeleteObjects, world.deleteObjects);
    receiver.on(ServerPacket.LoadGround, world.loadGround);
    receiver.on(ServerPacket.ClientConnectionInfo, world.clientConnectionInfo);
    receiver.on(ServerPacket.UpdateEquipment, world.updateEquipment);
    receiver.on(ServerPacket.ChatMessage, world.chatMessage);
    receiver.on(ServerPacket.SetSelectedStructure, world.selectStructure);
}

export function setupGUIPacketReceiving(
    receiver: ClientPacketReceiver<typeof Schema.Server, ServerPacketMap>,
    ui: UI
) {
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
