import { describe, expect, test } from "bun:test";
import { serverTime } from "@client/globals";

describe("serverTime", () => {
  test("now() is close to performance.now()", () => {
    const before = performance.now();
    const now = serverTime.now();
    const after = performance.now();
    expect(now).toBeGreaterThanOrEqual(before - 1);
    expect(now).toBeLessThanOrEqual(after + 1);
  });
});
