import { ClientPacket } from "@bundu/shared/packet_definitions";
import type { ServerPacketReceiver } from "../engine";
import type { PlayerSystem } from "../systems/player";

export function setupPacketReceiving(
    receiver: ServerPacketReceiver,
    system: PlayerSystem
) {
    receiver.on(ClientPacket.Attack, system.attack);
    receiver.on(ClientPacket.Block, system.block);
    receiver.on(ClientPacket.ChatMessage, system.chatMessage);
    receiver.on(ClientPacket.Movement, system.move);
    receiver.on(ClientPacket.Rotation, system.rotate);
    receiver.on(ClientPacket.PlaceStructureAt, system.placeStructureAt);
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
}
