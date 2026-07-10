import { describe, expect, test } from "bun:test";
import { serverTime } from "@client/globals";

describe("serverTime", () => {
  test("now() equals performance.now() + offset + ping - renderDelay", () => {
    const saved = {
      ping: serverTime.ping,
      offset: serverTime.offset,
      renderDelay: serverTime.renderDelay,
    };

    try {
      serverTime.ping = 40;
      serverTime.offset = 100;
      serverTime.renderDelay = 500;

      const before = performance.now();
      const result = serverTime.now();
      const after = performance.now();

      const expectedMin = before + 100 + 40 - 500;
      const expectedMax = after + 100 + 40 - 500;
      expect(result).toBeGreaterThanOrEqual(expectedMin - 1);
      expect(result).toBeLessThanOrEqual(expectedMax + 1);

      // Changing one field shifts now() by the same delta
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
