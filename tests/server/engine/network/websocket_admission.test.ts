import { describe, expect, test } from "bun:test";
import {
  redactCredential,
  WebSocketAdmissionPolicy,
} from "../../../../packages/server/src/engine/network/websocket_admission";

describe("WebSocketAdmissionPolicy", () => {
  const sessionId = "valid_session_1234";

  test("production permits non-browser clients but rejects unknown origins", () => {
    const policy = new WebSocketAdmissionPolicy({
      environment: "production",
      allowedOrigins: ["https://bundu.io"],
    });
    expect(policy.inspectUpgrade(new Request("https://server.test"), sessionId).ok).toBeTrue();
    expect(policy.inspectUpgrade(new Request("https://server.test", {
      headers: { origin: "https://evil.test" },
    }), sessionId).ok).toBeFalse();
    expect(policy.inspectUpgrade(new Request("https://server.test", {
      headers: { origin: "https://bundu.io" },
    }), sessionId).ok).toBeTrue();
  });

  test("local development explicitly permits no Origin", () => {
    const policy = new WebSocketAdmissionPolicy({ environment: "development" });
    expect(policy.inspectUpgrade(new Request("http://localhost"), sessionId).ok).toBeTrue();
  });

  test("bounds payloads and session identifiers", () => {
    const policy = new WebSocketAdmissionPolicy({
      environment: "development",
      maxPayloadBytes: 10,
    });
    expect(policy.inspectPayload(11)?.reason).toBe("payload_too_large");
    expect(policy.inspectUpgrade(new Request("http://localhost"), "../secret").ok).toBeFalse();
  });

  test("redacts credentials in logs", () => {
    expect(redactCredential("abcdefghijklmnop")).toBe("abcd…mnop");
    expect(redactCredential("short")).toBe("[redacted]");
  });
});
