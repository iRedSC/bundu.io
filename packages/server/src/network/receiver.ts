import { ClientPacket } from "@bundu/shared/packet_definitions";
import type { ServerPacketReceiver } from "../engine";
import type { AdminEditorSystem } from "../admin/editor";
import type { CreativeModeSystem } from "../creative/mode";
import type { PlayerSystem } from "../systems/player";

export function setupPacketReceiving(
    receiver: ServerPacketReceiver,
    system: PlayerSystem,
    admin: AdminEditorSystem,
    creative: CreativeModeSystem
) {
    receiver.on(ClientPacket.Attack, system.attack);
    receiver.on(ClientPacket.Block, system.block);
    receiver.on(ClientPacket.ChatMessage, system.chatMessage);
    receiver.on(ClientPacket.Movement, system.move);
    receiver.on(ClientPacket.Rotation, system.rotate);
    receiver.on(ClientPacket.PlaceStructure, system.placeStructure);
    receiver.on(
        ClientPacket.SetStructurePlacement,
        system.setStructurePlacement
    );
    receiver.on(ClientPacket.SelectItem, system.selectItem);
    receiver.on(ClientPacket.MoveSlot, system.moveSlot);
    receiver.on(ClientPacket.CursorSlot, system.cursorSlot);
    receiver.on(ClientPacket.CraftItem, system.craftItem);
    receiver.on(ClientPacket.ViewBounds, system.viewBounds);
    receiver.on(ClientPacket.FreecamCursor, system.freecamCursor);
    receiver.on(ClientPacket.ClientReady, system.clientReady);
    receiver.on(ClientPacket.ExitFreecamAt, system.exitFreecamAt);
    receiver.on(ClientPacket.AdminPlace, admin.adminPlace);
    receiver.on(ClientPacket.AdminDeleteAt, admin.adminDeleteAt);
    receiver.on(ClientPacket.AdminSetAnimalsFrozen, admin.adminSetAnimalsFrozen);
    receiver.on(ClientPacket.AdminSetGhostVisible, admin.adminSetGhostVisible);
    receiver.on(ClientPacket.AdminKillAnimals, admin.adminKillAnimals);
    receiver.on(ClientPacket.AdminStrokeBegin, admin.adminStrokeBegin);
    receiver.on(ClientPacket.AdminStrokeEnd, admin.adminStrokeEnd);
    receiver.on(ClientPacket.AdminUndo, admin.adminUndo);
    receiver.on(ClientPacket.AdminRedo, admin.adminRedo);
    receiver.on(ClientPacket.AdminSaveMap, admin.adminSaveMap);
    receiver.on(ClientPacket.AdminDownloadMap, admin.adminDownloadMap);
    receiver.on(ClientPacket.AdminNewMap, admin.adminNewMap);
    receiver.on(ClientPacket.AdminImportMap, admin.adminImportMap);
    receiver.on(ClientPacket.CreativeGive, creative.creativeGive);
    receiver.on(ClientPacket.CreativeSetGodmode, creative.creativeSetGodmode);
    receiver.on(ClientPacket.CreativeSetSpeed, creative.creativeSetSpeed);
    receiver.on(ClientPacket.CreativeSetInstakill, creative.creativeSetInstakill);
    receiver.on(ClientPacket.CreativeGiveToCursor, creative.creativeGiveToCursor);
    receiver.on(ClientPacket.CreativeVoid, creative.creativeVoid);
    receiver.on(ClientPacket.CreativeClearInventory, creative.creativeClearInventory);
    receiver.on(ClientPacket.CreativeGiveKit, creative.creativeGiveKit);
}
