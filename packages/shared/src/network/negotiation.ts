import { decode, encode } from "@msgpack/msgpack";

export const PROTOCOL_VERSION = 1;
export const NEGOTIATION_PACKET_ID = -1;
export const SUPPORTED_FEATURES = ["bounded-admission"] as const;

export type Hello = {
    protocolVersion: number;
    packFingerprint: string;
    features: string[];
};

export type ServerLimits = {
    maxFrameBytes: number;
    maxReliableQueue: number;
    maxPacketsPerPlayerTick: number;
    maxPacketsGlobalTick: number;
};

export type Welcome = {
    protocolVersion: number;
    packFingerprint: string;
    limits: ServerLimits;
    features: string[];
};

export type NegotiationFailure =
    | "invalid_hello"
    | "version_mismatch"
    | "pack_mismatch";

export function encodeHello(hello: Hello): Uint8Array {
    return encode([
        NEGOTIATION_PACKET_ID,
        hello.protocolVersion,
        hello.packFingerprint,
        hello.features,
    ]);
}

export function decodeHello(
    data: ArrayBuffer | ArrayBufferView,
    expectedPackFingerprint: string,
    maxBytes: number
): { ok: true; hello: Hello } | { ok: false; error: NegotiationFailure } {
    const bytes =
        data instanceof ArrayBuffer
            ? new Uint8Array(data)
            : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    if (bytes.byteLength > maxBytes) return { ok: false, error: "invalid_hello" };

    let value: unknown;
    try {
        value = decode(bytes, {
            maxArrayLength: 16,
            maxMapLength: 8,
            maxStrLength: 256,
        });
    } catch {
        return { ok: false, error: "invalid_hello" };
    }
    if (
        !Array.isArray(value) ||
        value.length !== 4 ||
        value[0] !== NEGOTIATION_PACKET_ID ||
        !Number.isSafeInteger(value[1]) ||
        typeof value[2] !== "string" ||
        value[2].length > 128 ||
        !Array.isArray(value[3]) ||
        value[3].length > 16 ||
        !value[3].every(
            (feature) => typeof feature === "string" && feature.length <= 64
        )
    ) {
        return { ok: false, error: "invalid_hello" };
    }
    if (value[1] !== PROTOCOL_VERSION) {
        return { ok: false, error: "version_mismatch" };
    }
    if (value[2] !== expectedPackFingerprint) {
        return { ok: false, error: "pack_mismatch" };
    }
    return {
        ok: true,
        hello: {
            protocolVersion: value[1],
            packFingerprint: value[2],
            features: value[3],
        },
    };
}

export function encodeWelcome(welcome: Welcome, serverTime: number): Uint8Array {
    return encode([
        serverTime,
        [
            NEGOTIATION_PACKET_ID,
            welcome.protocolVersion,
            welcome.packFingerprint,
            welcome.limits,
            welcome.features,
        ],
    ]);
}

export function decodeWelcome(packet: readonly unknown[]): Welcome | undefined {
    if (
        packet.length !== 5 ||
        packet[0] !== NEGOTIATION_PACKET_ID ||
        !Number.isSafeInteger(packet[1]) ||
        typeof packet[2] !== "string" ||
        typeof packet[3] !== "object" ||
        packet[3] === null ||
        !Array.isArray(packet[4]) ||
        !packet[4].every((feature) => typeof feature === "string")
    ) {
        return;
    }
    const limits = packet[3] as Record<string, unknown>;
    if (
        !Number.isSafeInteger(limits.maxFrameBytes) ||
        !Number.isSafeInteger(limits.maxReliableQueue) ||
        !Number.isSafeInteger(limits.maxPacketsPerPlayerTick) ||
        !Number.isSafeInteger(limits.maxPacketsGlobalTick)
    ) {
        return;
    }
    return {
        protocolVersion: packet[1] as number,
        packFingerprint: packet[2],
        limits: limits as ServerLimits,
        features: packet[4],
    };
}
