import { encode } from "@msgpack/msgpack";
import type { Serializer } from "@bundu/shared";

export class Socket<
    S extends Record<number, { fields: readonly string[] }>,
    DataMap extends Record<number, any>
> extends WebSocket {
    serializer: Serializer<S, DataMap>;

    constructor(
        url: string | URL,
        serializer: Serializer<S, DataMap>,
        protocols?: string | string[]
    ) {
        super(url, protocols);
        this.serializer = serializer;
    }

    sendPacket<I extends keyof S & number>(
        id: I,
        data: I extends keyof DataMap ? DataMap[I] & Record<string, any> : never
    ): void {
        super.send(encode(this.serializer.serialize(id, data)));
    }
}
