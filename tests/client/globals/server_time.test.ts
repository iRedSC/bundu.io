import { describe, expect, test } from "bun:test";
import { serverTime } from "@client/globals";

describe("serverTime", () => {
  test("changing offset shifts now() by the same delta", () => {
    const saved = {
      ping: serverTime.ping,
      offset: serverTime.offset,
      renderDelay: serverTime.renderDelay,
    };

    try {
      serverTime.ping = 40;
      serverTime.offset = 100;
      serverTime.renderDelay = 500;

      const baseline = serverTime.now();
      serverTime.offset += 25;
      const shifted = serverTime.now();
      expect(shifted - baseline).toBeCloseTo(25, 0);
    } finally {
      serverTime.ping = saved.ping;
      serverTime.offset = saved.offset;
      serverTime.renderDelay = saved.renderDelay;
    }
  });
});
