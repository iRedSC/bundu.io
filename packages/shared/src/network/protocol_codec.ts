import { decode, encode } from "@msgpack/msgpack";
import type { SerializedPacket } from "./serializer";

export type ServerFrame = [serverTime: number, ...packets: SerializedPacket[]];

export type ProtocolDecodeError =
    | "frame_too_large"
    | "invalid_msgpack"
    | "invalid_envelope"
    | "invalid_timestamp"
    | "too_many_packets"
    | "invalid_packet";

export type ProtocolDecodeResult =
    | { ok: true; value: ServerFrame }
    | { ok: false; error: ProtocolDecodeError };

export type ProtocolLimits = {
    maxFrameBytes: number;
    maxPacketsPerFrame: number;
};

export const DEFAULT_PROTOCOL_LIMITS: ProtocolLimits = {
    maxFrameBytes: 8 * 1024 * 1024,
    maxPacketsPerFrame: 4_096,
};

function asBytes(data: ArrayBuffer | ArrayBufferView): Uint8Array {
    if (data instanceof ArrayBuffer) return new Uint8Array(data);
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
}

function isSerializedPacket(value: unknown): value is SerializedPacket {
    return (
        Array.isArray(value) &&
        value.length > 0 &&
        Number.isSafeInteger(value[0])
    );
}

export class ProtocolCodec {
    constructor(
        private readonly limits: ProtocolLimits = DEFAULT_PROTOCOL_LIMITS
    ) {}

    decodeServerFrame(
        data: ArrayBuffer | ArrayBufferView
    ): ProtocolDecodeResult {
        const bytes = asBytes(data);
        if (bytes.byteLength > this.limits.maxFrameBytes) {
            return { ok: false, error: "frame_too_large" };
        }

        let decoded: unknown;
        try {
            decoded = decode(bytes, {
                maxArrayLength: this.limits.maxPacketsPerFrame + 1,
                maxBinLength: this.limits.maxFrameBytes,
                maxMapLength: this.limits.maxPacketsPerFrame,
                maxStrLength: this.limits.maxFrameBytes,
            });
        } catch {
            return { ok: false, error: "invalid_msgpack" };
        }

        if (!Array.isArray(decoded) || decoded.length === 0) {
            return { ok: false, error: "invalid_envelope" };
        }
        if (
            typeof decoded[0] !== "number" ||
            !Number.isFinite(decoded[0])
        ) {
            return { ok: false, error: "invalid_timestamp" };
        }
        if (decoded.length - 1 > this.limits.maxPacketsPerFrame) {
            return { ok: false, error: "too_many_packets" };
        }
        if (!decoded.slice(1).every(isSerializedPacket)) {
            return { ok: false, error: "invalid_packet" };
        }

        return { ok: true, value: decoded as ServerFrame };
    }

    encodeServerFrame(frame: ServerFrame): Uint8Array {
        return encode(frame);
    }
}
