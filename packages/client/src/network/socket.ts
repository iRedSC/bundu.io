import { encode } from "@msgpack/msgpack";
import type { Serializer } from "@bundu/shared";
import type { ClientPacketMap } from "@bundu/shared/packet_definitions";

export class Socket extends WebSocket {
    constructor(
        url: string | URL,
        private serializer: Serializer<ClientPacketMap>,
        protocols?: string | string[]
    ) {
        super(url, protocols);
    }

    sendPacket<I extends keyof ClientPacketMap & number>(
        id: I,
        data: ClientPacketMap[I]
    ): void {
        super.send(encode(this.serializer.serialize(id, data)));
    }
}
