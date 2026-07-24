import { describe, expect, test } from "bun:test";
import { encode } from "@msgpack/msgpack";
import { ProtocolCodec } from "@bundu/shared";

function asArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

describe("ProtocolCodec", () => {
  test("round-trips a valid server frame", () => {
    const codec = new ProtocolCodec();
    const frame = [123, [1, "value"], [2]] as [
      number,
      [number, string],
      [number],
    ];

    expect(codec.decodeServerFrame(codec.encodeServerFrame(frame))).toEqual({
      ok: true,
      value: frame,
    });
  });

  test("rejects malformed bytes without throwing", () => {
    const codec = new ProtocolCodec();
    const result = codec.decodeServerFrame(
      asArrayBuffer(new Uint8Array([0xc1])),
    );

    expect(result).toEqual({ ok: false, error: "invalid_msgpack" });
  });

  test("requires a finite timestamp and packet tuples", () => {
    const codec = new ProtocolCodec();

    expect(codec.decodeServerFrame(encode([Number.NaN]))).toEqual({
      ok: false,
      error: "invalid_timestamp",
    });
    expect(codec.decodeServerFrame(encode([1, "packet"]))).toEqual({
      ok: false,
      error: "invalid_packet",
    });
    expect(codec.decodeServerFrame(encode([1, []]))).toEqual({
      ok: false,
      error: "invalid_packet",
    });
  });

  test("enforces byte and packet limits", () => {
    const byteLimited = new ProtocolCodec({
      maxFrameBytes: 2,
      maxPacketsPerFrame: 10,
    });
    const packetLimited = new ProtocolCodec({
      maxFrameBytes: 1_024,
      maxPacketsPerFrame: 1,
    });

    expect(byteLimited.decodeServerFrame(encode([1, [2]]))).toEqual({
      ok: false,
      error: "frame_too_large",
    });
    expect(packetLimited.decodeServerFrame(encode([1, [2], [3]]))).toEqual({
      ok: false,
      error: "invalid_msgpack",
    });
  });
});
