import {
    ServerSchema,
    ServerPacket,
    type ServerPacketMap,
} from "@bundu/shared/packet_definitions";
import { ClientPacketReceiver } from "./client_receiver";
import { Serializer } from "@bundu/shared";
import type { World } from "../world/world";
import type { UI } from "../ui/ui";
import type { ChatController } from "../ui/chat";
import { AnimationManagers } from "../animation/animations";
import { downloadMapYaml } from "../admin/map_export";
import { Player } from "../world/objects/player";
import { FreecamGhost } from "../world/objects/freecam_ghost";

export const receiver = new ClientPacketReceiver(
    new Serializer<ServerPacketMap>(ServerSchema)
);

/** Effective sourced flags for the local player (crafting + gameplay). */
let playerFlags: number[] = [];
/** Effective `crafting.multiplier` for local craft cost checks. */
let craftingMultiplier = 1;

export function resetGUIReceiverState(ui: UI): void {
    playerFlags = [];
    craftingMultiplier = 1;
    ui.inventory.updateLocks([]);
    ui.inventory.setEquipment(-1, -1, -1);
}

function refreshCraftingMenu(ui: UI): void {
    ui.craftingMenu.items = ui.recipeManager.filter(
        ui.inventory.items,
        playerFlags,
        craftingMultiplier
    );
    ui.craftingMenu.update();
}

/** Show persistent lock wipe on recipes with craft-locked ingredients. */
function applyCraftRecipeLocks(ui: UI): void {
    for (const [i, button] of ui.craftingMenu.buttons.entries()) {
        const view = ui.craftingMenu.items[i];
        if (!view) {
            button.setItemLock(null);
            continue;
        }
        const recipe = ui.recipeManager.recipes.get(view.recipeId);
        if (!recipe) {
            button.setItemLock(null);
            continue;
        }
        const craftLock = ui.inventory.craftLockForIngredients(
            recipe.ingredients.keys()
        );
        button.setItemLock(craftLock ?? null, craftLock !== undefined);
    }
}

export function setupPacketReceiving(
    receiver: ClientPacketReceiver,
    world: World
) {
    receiver.on(ServerPacket.LoadObject, world.loadObject);
    receiver.on(ServerPacket.DropItem, world.dropItem);
    receiver.on(ServerPacket.AttackEvent, world.combatFx.attack);
    receiver.on(ServerPacket.BlockEvent, world.combatFx.block);
    receiver.on(ServerPacket.EatEvent, world.combatFx.eat);
    receiver.on(ServerPacket.HitEvent, world.combatFx.hurt);
    receiver.on(ServerPacket.CraftEvent, world.craftEvent);
    receiver.on(ServerPacket.SetPosition, world.moveObject);
    receiver.on(ServerPacket.SetRotation, world.rotateObject);
    receiver.on(ServerPacket.DeleteObjects, world.deleteObjects);
    receiver.on(ServerPacket.LoadGround, world.loadGround);
    receiver.on(ServerPacket.UnloadGround, world.unloadGround);
    receiver.on(ServerPacket.LoadDecorations, world.loadDecorations);
    receiver.on(ServerPacket.UnloadDecorations, world.unloadDecorations);
    receiver.on(ServerPacket.ClientConnectionInfo, world.clientConnectionInfo);
    receiver.on(ServerPacket.UpdateEquipment, world.updateEquipment);
    receiver.on(ServerPacket.SetPlayerVisual, world.setPlayerVisual);
    // ChatMessage → world bubbles; log wiring is in setupChatPacketReceiving.
    receiver.on(ServerPacket.SetSelectedStructure, world.selectStructure);
    receiver.on(
        ServerPacket.PlaceStructureResult,
        world.placeStructureResult
    );
    receiver.on(ServerPacket.UpdateObjectHealth, world.updateObjectHealth);
    receiver.on(ServerPacket.SetStructureState, world.setStructureState);
    receiver.on(ServerPacket.SetTimeOfDay, ({ period }) => {
        world.sky.setTime(period, AnimationManagers.World);
    });
    receiver.on(ServerPacket.AdminMapYaml, ({ yaml, saved }) => {
        if (saved) {
            window.alert("Map saved on server.");
            return;
        }
        downloadMapYaml(yaml);
    });
    receiver.on(ServerPacket.SetWorldSize, ({ worldTiles }) => {
        world.setWorldSize(worldTiles);
    });
}

export function setupChatPacketReceiving(
    receiver: ClientPacketReceiver,
    world: World,
    chat: ChatController
) {
    receiver.on(ServerPacket.ChatMessage, (packet) => {
        world.chatMessage(packet);
        const object = world.objects.get(packet.id);
        const name =
            object instanceof Player
                ? object.name.text || "???"
                : object instanceof FreecamGhost
                  ? object.displayName || "???"
                  : "???";
        chat.appendPlayerMessage(name, packet.message);
    });
    receiver.on(ServerPacket.CommandRegistry, ({ commands }) => {
        chat.setRegistry({ commands });
    });
    receiver.on(ServerPacket.CommandResult, ({ message, ok }) => {
        chat.appendCommandResult(message, ok);
    });
}

export function setupGUIPacketReceiving(
    receiver: ClientPacketReceiver,
    ui: UI,
    world: World
) {
    ui.inventory.onLocksChanged = () => applyCraftRecipeLocks(ui);
    ui.craftingMenu.onAfterUpdate = () => applyCraftRecipeLocks(ui);
    receiver.on(
        ServerPacket.UpdateVitals,
        ({ health, hunger, heat, thirst, air }) => {
            ui.health.update(health);
            ui.hunger.update(hunger);
            ui.heat.update(heat);
            ui.thirst.update(thirst);
            world.setLocalAir(air);
        }
    );
    receiver.on(
        ServerPacket.RecipeList,
        ui.recipeManager.updateRecipes.bind(ui.recipeManager)
    );
    receiver.on(ServerPacket.UpdateInventory, (packet) => {
        ui.inventory.update(packet);
        refreshCraftingMenu(ui);
    });
    receiver.on(ServerPacket.UpdateItemLocks, ({ locks }) => {
        ui.inventory.updateLocks(locks);
    });
    receiver.on(ServerPacket.SelectItemResult, ({ selected }) => {
        ui.inventory.reconcileSelection(selected);
    });
    receiver.on(ServerPacket.UpdateFlags, ({ flags }) => {
        playerFlags = [...flags];
        refreshCraftingMenu(ui);
    });
    receiver.on(ServerPacket.UpdateCraftingMultiplier, ({ multiplier }) => {
        craftingMultiplier = multiplier;
        refreshCraftingMenu(ui);
    });
    receiver.on(
        ServerPacket.Leaderboard,
        ui.leaderboard.update.bind(ui.leaderboard)
    );
}
