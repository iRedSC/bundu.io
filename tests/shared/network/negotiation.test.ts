import { describe, expect, test } from "bun:test";
import { encode } from "@msgpack/msgpack";
import {
  decodeHello,
  encodeHello,
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
});
