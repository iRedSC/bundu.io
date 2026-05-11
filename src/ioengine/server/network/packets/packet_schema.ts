import { ServerPacket, type ServerPacketMap } from "@shared/packet_definitions";

const PacketScope = {
    World: 0x00,
    Global: 0x01,
    Private: 0x02,
} as const;
type PacketScope = (typeof PacketScope)[keyof typeof PacketScope];

const packet = {
    id: ServerPacket.SetPosition,
    scope: PacketScope.Private,
    target: 2,
    payload: {
        object: 10,
        x: 1,
        y: 10,
    },
};

const packet2 = {
    id: ServerPacket.SetPosition,
    scope: PacketScope.World,
    source: 2,
    payload: {
        object: 10,
        x: 1,
        y: 10,
    },
};
