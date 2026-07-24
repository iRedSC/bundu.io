import { describe, expect, test } from "bun:test";
import { encode } from "@msgpack/msgpack";
import {
  decodeHello,
  decodeWelcome,
  encodeHello,
  encodeWelcome,
  PROTOCOL_VERSION,
  SUPPORTED_FEATURES,
} from "@bundu/shared";

describe("protocol negotiation", () => {
  const fingerprint = "pack-fingerprint";

  test("accepts matching Hello", () => {
    const result = decodeHello(
      encodeHello({
        protocolVersion: PROTOCOL_VERSION,
        packFingerprint: fingerprint,
        features: [...SUPPORTED_FEATURES],
      }),
      fingerprint,
      1024,
    );
    expect(result.ok).toBeTrue();
  });

  test("rejects version and pack mismatches", () => {
    expect(decodeHello(encode([-1, 999, fingerprint, []]), fingerprint, 1024)).toEqual({
      ok: false,
      error: "version_mismatch",
    });
    expect(decodeHello(encode([-1, PROTOCOL_VERSION, "other", []]), fingerprint, 1024)).toEqual({
      ok: false,
      error: "pack_mismatch",
    });
  });

  test("Welcome carries a bounded rotated reconnect credential", () => {
    const credential = "rotated_reconnect_credential";
    const encoded = encodeWelcome({
      protocolVersion: PROTOCOL_VERSION,
      packFingerprint: fingerprint,
      features: [...SUPPORTED_FEATURES],
      reconnectCredential: credential,
      limits: {
        maxFrameBytes: 1024,
        maxReliableQueue: 8,
        maxPacketsPerPlayerTick: 4,
        maxPacketsGlobalTick: 16,
      },
    }, 1);
    const decoded = decodeWelcome((encoded as unknown as readonly unknown[]));

    expect(encoded.byteLength).toBeGreaterThan(0);
    expect(decoded).toBeUndefined();
    expect(decodeWelcome([
      -1,
      PROTOCOL_VERSION,
      fingerprint,
      {
        maxFrameBytes: 1024,
        maxReliableQueue: 8,
        maxPacketsPerPlayerTick: 4,
        maxPacketsGlobalTick: 16,
      },
      [...SUPPORTED_FEATURES],
      credential,
    ])?.reconnectCredential).toBe(credential);
  });
});
