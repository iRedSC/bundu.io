import { describe, expect, test } from "bun:test";
import {
  parkedPlayerExpired,
  parkedPlayerTtlMs,
  reconnectCredentialMatches,
  rotateReconnectCredential,
} from "../../../packages/server/src/auth/session_policy";

describe("reconnect session policy", () => {
  test("rotation invalidates the credential that successfully reclaimed", () => {
    const presented = "presented_reconnect_credential";
    const rotated = rotateReconnectCredential();

    expect(reconnectCredentialMatches(presented, presented)).toBeTrue();
    expect(rotated).not.toBe(presented);
    expect(rotated.length).toBeGreaterThanOrEqual(16);
    expect(reconnectCredentialMatches(rotated, presented)).toBeFalse();
  });

  test("parked expiration is deterministic at the TTL boundary", () => {
    expect(parkedPlayerExpired(undefined, 10_000, 1_000)).toBeFalse();
    expect(parkedPlayerExpired(9_001, 10_000, 1_000)).toBeFalse();
    expect(parkedPlayerExpired(9_000, 10_000, 1_000)).toBeTrue();
  });

  test("parked TTL configuration is bounded", () => {
    expect(parkedPlayerTtlMs("1")).toBe(1_000);
    expect(parkedPlayerTtlMs("99999999")).toBe(600_000);
    expect(parkedPlayerTtlMs("invalid")).toBe(30_000);
  });
});
