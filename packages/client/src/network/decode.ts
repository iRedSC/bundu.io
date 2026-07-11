import { decode } from "@msgpack/msgpack";

/**
 * Synchronous msgpack decode for inbound WebSocket payloads.
 * Requires `socket.binaryType = "arraybuffer"` so messages are not Blobs.
 */
export function decodePacketData(data: ArrayBuffer | ArrayBufferView): unknown {
    if (data instanceof ArrayBuffer) {
        return decode(new Uint8Array(data));
    }
    return decode(
        new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
    );
}
