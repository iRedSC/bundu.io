import {
    ClientSchema,
    type ClientPacketMap,
} from "@bundu/shared/packet_definitions";
import { Serializer } from "@bundu/shared";

export const serializer = new Serializer<ClientPacketMap>(ClientSchema);
