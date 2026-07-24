import { describe, expect, test } from "bun:test";
import {
  LOCK_ACTIONS,
  LOCK_SLOTS,
  LOCK_SLOTS_ALL,
  isLockAction,
  isLockSlot,
  lockActionsToFlags,
  lockFlagsHas,
  lockFlagsToActions,
  lockSlotFlagsHas,
  lockSlotFlagsToSlots,
  lockSlotForItemFunction,
  lockSlotsToFlags,
  mootEquipLockFlags,
} from "@bundu/shared/item_lock";

describe("item lock action flags", () => {
  test("round-trips every action and preserves declaration order", () => {
    const flags = lockActionsToFlags([...LOCK_ACTIONS].reverse());

    expect(lockFlagsToActions(flags)).toEqual([...LOCK_ACTIONS]);
    for (const action of LOCK_ACTIONS) {
      expect(lockFlagsHas(flags, action)).toBe(true);
    }
  });

  test("deduplicates repeated actions through the bitset", () => {
    expect(lockFlagsToActions(lockActionsToFlags(["use", "use", "drop"]))).toEqual([
      "use",
      "drop",
    ]);
  });

  test("removes only the equip transition that is already moot", () => {
    const flags = lockActionsToFlags(["equip", "unequip", "use"]);

    expect(lockFlagsToActions(mootEquipLockFlags(flags, true))).toEqual([
      "unequip",
      "use",
    ]);
    expect(lockFlagsToActions(mootEquipLockFlags(flags, false))).toEqual([
      "equip",
      "use",
    ]);
  });

  test("recognizes only supported authored actions", () => {
    expect(LOCK_ACTIONS.every(isLockAction)).toBe(true);
    expect(isLockAction("swap")).toBe(false);
    expect(isLockAction("")).toBe(false);
  });
});

describe("item lock slot flags", () => {
  test("round-trips all slots and exposes the all-slots mask", () => {
    const flags = lockSlotsToFlags([...LOCK_SLOTS].reverse());

    expect(flags).toBe(LOCK_SLOTS_ALL);
    expect(lockSlotFlagsToSlots(flags)).toEqual([...LOCK_SLOTS]);
    for (const slot of LOCK_SLOTS) {
      expect(lockSlotFlagsHas(flags, slot)).toBe(true);
    }
  });

  test("recognizes only supported authored slots", () => {
    expect(LOCK_SLOTS.every(isLockSlot)).toBe(true);
    expect(isLockSlot("mainHand")).toBe(false);
    expect(isLockSlot("inventory")).toBe(false);
  });

  test("maps equippable item functions to their authoritative slot", () => {
    expect(lockSlotForItemFunction("main_hand")).toBe("mainhand");
    expect(lockSlotForItemFunction("building")).toBe("mainhand");
    expect(lockSlotForItemFunction("off_hand")).toBe("offhand");
    expect(lockSlotForItemFunction("wear")).toBe("helmet");
    expect(lockSlotForItemFunction("food")).toBeUndefined();
    expect(lockSlotForItemFunction(undefined)).toBeUndefined();
  });
});
