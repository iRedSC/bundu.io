import { describe, expect, test } from "bun:test";
import {
  JOIN_RECLAIM_REJECTED,
  SESSION_ENDED_CLOSE,
  SESSION_REJECTED_CLOSE,
  isHardSessionClose,
} from "@bundu/shared/session";

describe("session close codes", () => {
  test("exposes the hard-close wire codes", () => {
    expect(SESSION_ENDED_CLOSE).toBe(4000);
    expect(SESSION_REJECTED_CLOSE).toBe(4001);
  });

  test("exposes createPlayer join-failure ids", () => {
    expect(JOIN_RECLAIM_REJECTED).toBe(-1);
  });

  test("isHardSessionClose is true only for ended and rejected", () => {
    expect(isHardSessionClose(SESSION_ENDED_CLOSE)).toBe(true);
    expect(isHardSessionClose(SESSION_REJECTED_CLOSE)).toBe(true);
    expect(isHardSessionClose(1000)).toBe(false);
    expect(isHardSessionClose(1001)).toBe(false);
    expect(isHardSessionClose(4002)).toBe(false);
    expect(isHardSessionClose(0)).toBe(false);
    expect(isHardSessionClose(-1)).toBe(false);
  });
});
