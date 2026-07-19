import { describe, expect, test } from "bun:test";
import { isAllowedByLists } from "@bundu/server/configs/loaders/placement_rules";

describe("isAllowedByLists", () => {
  test("undefined allow list permits everything not denied", () => {
    expect(isAllowedByLists(7, undefined, undefined)).toBe(true);
    expect(isAllowedByLists(7, undefined, [])).toBe(true);
    expect(isAllowedByLists(7, undefined, [3, 9])).toBe(true);
  });

  test("empty allow list permits nothing", () => {
    expect(isAllowedByLists(1, [], undefined)).toBe(false);
    expect(isAllowedByLists(1, [], [])).toBe(false);
  });

  test("allow list permits only listed ids", () => {
    expect(isAllowedByLists(2, [2, 4], undefined)).toBe(true);
    expect(isAllowedByLists(3, [2, 4], undefined)).toBe(false);
  });

  test("deny wins over allow, including when listed in both", () => {
    expect(isAllowedByLists(5, [5], [5])).toBe(false);
    expect(isAllowedByLists(5, [5, 6], [5])).toBe(false);
    expect(isAllowedByLists(5, undefined, [5])).toBe(false);
    expect(isAllowedByLists(5, [], [5])).toBe(false);
    expect(isAllowedByLists(6, [5, 6], [5])).toBe(true);
    expect(isAllowedByLists(8, undefined, [8])).toBe(false);
  });
});
