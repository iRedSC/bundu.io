import {
    Schema,
    ClientPacket,
    type ClientPacketMap,
} from "@shared/packet_definitions";
import { Serializer, ServerPacketReceiver } from "@ioengine/server";
import type { PlayerSystem } from "../systems/player";

const ClientSerializer = new Serializer<typeof Schema.Client, ClientPacketMap>(
    Schema.Client
);
export const receiver = new ServerPacketReceiver<
    typeof Schema.Client,
    ClientPacketMap
>(ClientSerializer);

export function setupPacketReceiving(
    receiver: ServerPacketReceiver<typeof Schema.Client, ClientPacketMap>,
    system: PlayerSystem
) {
    receiver.on(ClientPacket.Attack, system.attack);
    receiver.on(ClientPacket.Block, system.block);
    receiver.on(ClientPacket.ChatMessage, system.chatMessage);
    receiver.on(ClientPacket.CraftItem, system.craftItem);
    receiver.on(ClientPacket.DropItem, system.dropItem);
    receiver.on(ClientPacket.Movement, system.move);
    receiver.on(ClientPacket.RequestObjects, system.requestObjects);
    // receiver.on(ClientPacket.RequestPlacementValidity)
    receiver.on(ClientPacket.Rotation, system.rotate);
    receiver.on(ClientPacket.SelectItem, system.selectItem);
}
