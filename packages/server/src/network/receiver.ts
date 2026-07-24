import {
    ClientPacket,
    type ClientPacketMap,
} from "@bundu/shared/packet_definitions";
import type { ServerPacketReceiver } from "../engine";
import type { AdminEditorSystem } from "../admin/editor";
import type { CreativeModeSystem } from "../creative/mode";
import type { PlayerSystem } from "../systems/player";
import {
    canUseCapability,
    type Capability,
} from "../auth/capabilities";

export function setupPacketReceiving(
    receiver: ServerPacketReceiver,
    system: PlayerSystem,
    admin: AdminEditorSystem,
    creative: CreativeModeSystem
) {
    const authorized = <I extends keyof ClientPacketMap & number>(
        capability: Capability,
        id: I,
        handler: (playerId: number, packet: ClientPacketMap[I]) => void
    ) => {
        receiver.on(id, (playerId, packet) => {
            const player = system.world.getObject(playerId);
            if (!player || !canUseCapability(player, capability)) return;
            handler(playerId, packet);
        });
    };

    authorized("gameplay", ClientPacket.Attack, system.attack);
    authorized("gameplay", ClientPacket.Interact, system.interact);
    authorized("gameplay", ClientPacket.Block, system.block);
    receiver.on(ClientPacket.ChatMessage, system.chatMessage);
    authorized("gameplay", ClientPacket.Movement, system.move);
    authorized("gameplay", ClientPacket.Rotation, system.rotate);
    authorized("gameplay", ClientPacket.PlaceStructure, system.placeStructure);
    authorized(
        "gameplay",
        ClientPacket.SetStructurePlacement,
        system.setStructurePlacement
    );
    authorized("gameplay", ClientPacket.SelectItem, system.selectItem);
    authorized("gameplay", ClientPacket.MoveSlot, system.moveSlot);
    authorized("gameplay", ClientPacket.CursorSlot, system.cursorSlot);
    authorized("gameplay", ClientPacket.CraftItem, system.craftItem);
    receiver.on(ClientPacket.ViewBounds, system.viewBounds);
    receiver.on(ClientPacket.FreecamCursor, system.freecamCursor);
    receiver.on(ClientPacket.ClientReady, system.clientReady);
    receiver.on(ClientPacket.ExitFreecamAt, system.exitFreecamAt);
    authorized("admin", ClientPacket.AdminPlace, admin.adminPlace);
    authorized("admin", ClientPacket.AdminDeleteAt, admin.adminDeleteAt);
    authorized(
        "admin",
        ClientPacket.AdminSetAnimalsFrozen,
        admin.adminSetAnimalsFrozen
    );
    authorized(
        "admin",
        ClientPacket.AdminSetGhostVisible,
        admin.adminSetGhostVisible
    );
    authorized("admin", ClientPacket.AdminKillAnimals, admin.adminKillAnimals);
    authorized("admin", ClientPacket.AdminStrokeBegin, admin.adminStrokeBegin);
    authorized("admin", ClientPacket.AdminStrokeEnd, admin.adminStrokeEnd);
    authorized("admin", ClientPacket.AdminUndo, admin.adminUndo);
    authorized("admin", ClientPacket.AdminRedo, admin.adminRedo);
    authorized("admin", ClientPacket.AdminSaveMap, admin.adminSaveMap);
    authorized("admin", ClientPacket.AdminDownloadMap, admin.adminDownloadMap);
    authorized("admin", ClientPacket.AdminNewMap, admin.adminNewMap);
    authorized("creative", ClientPacket.CreativeGive, creative.creativeGive);
    authorized(
        "creative",
        ClientPacket.CreativeSetGodmode,
        creative.creativeSetGodmode
    );
    authorized(
        "creative",
        ClientPacket.CreativeSetSpeed,
        creative.creativeSetSpeed
    );
    authorized(
        "creative",
        ClientPacket.CreativeSetInstakill,
        creative.creativeSetInstakill
    );
    authorized(
        "creative",
        ClientPacket.CreativeGiveToCursor,
        creative.creativeGiveToCursor
    );
    authorized("creative", ClientPacket.CreativeVoid, creative.creativeVoid);
    authorized(
        "creative",
        ClientPacket.CreativeClearInventory,
        creative.creativeClearInventory
    );
    authorized(
        "creative",
        ClientPacket.CreativeGiveKit,
        creative.creativeGiveKit
    );
}
