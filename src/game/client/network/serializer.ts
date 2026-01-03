import { Schema, type ClientPacketMap } from "@shared/packet_definitions";
import { Serializer } from "@ioengine/client";

export const serializer = new Serializer<typeof Schema.Client, ClientPacketMap>(
    Schema.Client
);
