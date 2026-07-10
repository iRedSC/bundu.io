import { describe, expect, test } from "bun:test";
import { serverTime } from "@client/globals";

describe("serverTime", () => {
  test("changing offset shifts now() by the same delta", () => {
    const saved = {
      offset: serverTime.offset,
      renderDelay: serverTime.renderDelay,
    };

    try {
      serverTime.offset = 100;
      serverTime.renderDelay = 500;

      const baseline = serverTime.now();
      serverTime.offset += 25;
      const shifted = serverTime.now();
      expect(shifted - baseline).toBeCloseTo(25, 0);
    } finally {
      serverTime.offset = saved.offset;
      serverTime.renderDelay = saved.renderDelay;
    }
  });
});
