import {
    ServerSchema,
    ServerPacket,
    type ServerPacketMap,
} from "@bundu/shared/packet_definitions";
import { ClientPacketReceiver } from "./client_receiver";
import { Serializer } from "@bundu/shared";
import type { World } from "../world/world";
import type { UI } from "../ui/ui";

export const receiver = new ClientPacketReceiver(
    new Serializer<ServerPacketMap>(ServerSchema)
);

export function setupPacketReceiving(
    receiver: ClientPacketReceiver,
    world: World
) {
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
    receiver: ClientPacketReceiver,
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
