import { ClientPacket } from "@bundu/shared/packet_definitions";
import { ServerPacketReceiver } from "../engine";
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
    receiver.on(ClientPacket.SelectItem, system.selectItem);
    receiver.on(ClientPacket.DropItem, system.dropItem);
}
