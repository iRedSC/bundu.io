import { describe, expect, test } from "bun:test";
import {
  formatItemLockTooltip,
  mergeItemLockVisuals,
  type ItemLockVisual,
} from "../../../packages/client/src/ui/item_button";
import {
  LOCK_ANY_ITEM,
  lockActionsToFlags,
  lockSlotsToFlags,
} from "@bundu/shared/item_lock";

function visual(overrides: Partial<ItemLockVisual> = {}): ItemLockVisual {
  return {
    itemId: 10,
    endsAt: 5_000,
    durationMs: 5_000,
    flags: lockActionsToFlags(["use"]),
    slotFlags: lockSlotsToFlags(["mainhand"]),
    ...overrides,
  };
}

describe("mergeItemLockVisuals", () => {
  test("returns no visual for no rules and preserves a single rule", () => {
    const only = visual();

    expect(mergeItemLockVisuals([])).toBeUndefined();
    expect(mergeItemLockVisuals([only])).toBe(only);
  });

  test("unions restrictions while the latest expiry owns timer presentation", () => {
    const merged = mergeItemLockVisuals([
      visual({
        itemId: LOCK_ANY_ITEM,
        endsAt: Number.POSITIVE_INFINITY,
        durationMs: 0,
        flags: lockActionsToFlags(["equip"]),
        slotFlags: lockSlotsToFlags(["helmet"]),
      }),
      visual({
        itemId: 20,
        endsAt: 8_000,
        durationMs: 2_000,
        flags: lockActionsToFlags(["drop"]),
        slotFlags: 0,
      }),
    ]);

    expect(merged).toEqual({
      itemId: 20,
      endsAt: Number.POSITIVE_INFINITY,
      durationMs: 0,
      flags: lockActionsToFlags(["equip", "drop"]),
      slotFlags: lockSlotsToFlags(["helmet"]),
    });
  });
});

describe("formatItemLockTooltip", () => {
  test("describes actions, scoped slots, and rounded remaining time", () => {
    expect(
      formatItemLockTooltip(
        visual({
          endsAt: 2_001,
          flags: lockActionsToFlags(["use", "drop"]),
          slotFlags: lockSlotsToFlags(["mainhand"]),
        }),
        1_000,
      ),
    ).toBe("Can't use or drop (mainhand) · 2s left");
  });

  test("describes permanent locks and omits all-slot noise", () => {
    expect(
      formatItemLockTooltip(
        visual({
          endsAt: Number.POSITIVE_INFINITY,
          slotFlags: lockSlotsToFlags(["mainhand", "offhand", "helmet"]),
        }),
      ),
    ).toBe("Can't use until unlocked");
  });

  test("returns no tooltip when no action is restricted", () => {
    expect(formatItemLockTooltip(visual({ flags: 0 }))).toBe("");
  });
});
