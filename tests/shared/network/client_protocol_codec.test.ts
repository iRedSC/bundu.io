import { describe, expect, test } from "bun:test";
import { encode } from "@msgpack/msgpack";
import { ProtocolCodec, Serializer } from "@bundu/shared";
import {
  ClientPacket,
  ClientPacketGuards,
  ClientSchema,
  type ClientPacketMap,
} from "@bundu/shared/packet_definitions";

const serializer = new Serializer<ClientPacketMap>(ClientSchema);
const codec = new ProtocolCodec({
  maxFrameBytes: 64,
  maxPacketsPerFrame: 1,
});

describe("ProtocolCodec client frames", () => {
  test("returns typed failures for malformed frames", () => {
    expect(codec.decodeClientPacket(new Uint8Array([0xc1]), serializer, ClientPacketGuards)).toEqual({
      ok: false,
      error: "invalid_msgpack",
    });
    expect(codec.decodeClientPacket(encode({ id: 1 }), serializer, ClientPacketGuards)).toEqual({
      ok: false,
      error: "invalid_envelope",
    });
    expect(codec.decodeClientPacket(encode([999]), serializer, ClientPacketGuards)).toEqual({
      ok: false,
      error: "unknown_packet",
    });
  });

  test("enforces exact fields and packet guards", () => {
    expect(codec.decodeClientPacket(encode([ClientPacket.Rotation]), serializer, ClientPacketGuards)).toEqual({
      ok: false,
      error: "invalid_field_count",
    });
    expect(codec.decodeClientPacket(encode([ClientPacket.Rotation, Infinity]), serializer, ClientPacketGuards)).toEqual({
      ok: false,
      error: "invalid_fields",
    });
  });

  test("accepts a known valid packet and enforces bytes", () => {
    const valid = codec.decodeClientPacket(
      encode([ClientPacket.Rotation, 90]),
      serializer,
      ClientPacketGuards,
    );
    expect(valid.ok).toBeTrue();

    const limited = new ProtocolCodec({ maxFrameBytes: 2, maxPacketsPerFrame: 1 });
    expect(limited.decodeClientPacket(encode([ClientPacket.Rotation, 90]), serializer, ClientPacketGuards)).toEqual({
      ok: false,
      error: "frame_too_large",
    });
  });
});
