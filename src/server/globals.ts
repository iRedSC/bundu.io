import { ClientPacketHandler } from "./network/packets.js";
import { PacketFactory } from "./network/send.js";
import { SocketManager } from "./network/socket_manager.js";

export const GlobalPacketFactory = new PacketFactory();

export const GlobalClientPacketHandler = new ClientPacketHandler();

export const GlobalSocketManager = new SocketManager();
