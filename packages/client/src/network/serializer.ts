import { Schema, type ClientPacketMap } from "@bundu/shared/packet_definitions";
import { Serializer } from "@bundu/shared";

export const serializer = new Serializer<typeof Schema.Client, ClientPacketMap>(
    Schema.Client
);
