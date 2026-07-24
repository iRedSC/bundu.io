import { describe, expect, test } from "bun:test";
import {
  JOIN_RECLAIM_REJECTED,
  JOIN_USERNAME_TAKEN,
  SESSION_ENDED_CLOSE,
  SESSION_REJECTED_CLOSE,
  USERNAME_TAKEN_CLOSE,
  isHardSessionClose,
} from "@bundu/shared/session";

describe("session close codes", () => {
  test("exposes the hard-close wire codes", () => {
    expect(SESSION_ENDED_CLOSE).toBe(4000);
    expect(SESSION_REJECTED_CLOSE).toBe(4001);
    expect(USERNAME_TAKEN_CLOSE).toBe(4002);
  });

  test("exposes createPlayer join-failure ids", () => {
    expect(JOIN_RECLAIM_REJECTED).toBe(-1);
    expect(JOIN_USERNAME_TAKEN).toBe(-2);
  });

  test("isHardSessionClose is true only for ended, rejected, and username taken", () => {
    expect(isHardSessionClose(SESSION_ENDED_CLOSE)).toBe(true);
    expect(isHardSessionClose(SESSION_REJECTED_CLOSE)).toBe(true);
    expect(isHardSessionClose(USERNAME_TAKEN_CLOSE)).toBe(true);
    expect(isHardSessionClose(1000)).toBe(false);
    expect(isHardSessionClose(1001)).toBe(false);
    expect(isHardSessionClose(4003)).toBe(false);
    expect(isHardSessionClose(0)).toBe(false);
    expect(isHardSessionClose(-1)).toBe(false);
  });
});
