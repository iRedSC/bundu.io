import { beforeEach, describe, expect, test } from "bun:test";
import {
  HOTBAR_SIZE,
  SLOT_OUTSIDE,
  addItem,
  canConsumeAndAdd,
  countItem,
  cursorSlot,
  emptySlots,
  hasItems,
  moveSlot,
  removeItem,
  removeItems,
  tryAddItems,
  tryConsumeAndAdd,
  type Inventory,
  type ItemStack,
} from "@bundu/server/components/inventory";
import { MAX_STACK, PlaceMode } from "@bundu/shared/inventory";

function makeInv(
  slots: (ItemStack | null)[],
  selected = 0,
  cursor: ItemStack | null = null,
): Inventory {
  return { slots, selected, cursor };
}

function snapshot(inv: Inventory): Inventory {
  return {
    selected: inv.selected,
    cursor: inv.cursor === null ? null : { ...inv.cursor },
    slots: inv.slots.map((slot) => (slot === null ? null : { ...slot })),
  };
}

describe("emptySlots", () => {
  test("defaults to HOTBAR_SIZE nulls and honors an explicit count", () => {
    expect(emptySlots()).toEqual(Array.from({ length: HOTBAR_SIZE }, () => null));
    expect(emptySlots()).toHaveLength(10);
    expect(emptySlots(3)).toEqual([null, null, null]);
  });
});

describe("addItem", () => {
  test("fills same-id stacks first, then empty slots left-to-right", () => {
    const inv = makeInv([
      { id: 1, count: 900 },
      null,
      { id: 1, count: 50 },
      null,
    ]);

    expect(addItem(inv, 1, 120)).toBe(0);
    expect(inv.slots).toEqual([
      { id: 1, count: MAX_STACK },
      null,
      { id: 1, count: 71 },
      null,
    ]);
    expect(inv.cursor).toBeNull();
    expect(inv.selected).toBe(0);

    // Overflow remaining same-id capacity (999-71=928) into the first empty slot.
    expect(addItem(inv, 1, 930)).toBe(0);
    expect(inv.slots).toEqual([
      { id: 1, count: MAX_STACK },
      { id: 1, count: 2 },
      { id: 1, count: MAX_STACK },
      null,
    ]);
  });

  test("respects MAX_STACK boundaries and returns leftover that cannot fit", () => {
    const nearCap = makeInv([{ id: 2, count: MAX_STACK - 1 }, null]);
    expect(addItem(nearCap, 2, 1)).toBe(0);
    expect(nearCap.slots).toEqual([{ id: 2, count: MAX_STACK }, null]);

    const inv = makeInv([{ id: 2, count: MAX_STACK }, null]);
    expect(addItem(inv, 2, 5)).toBe(0);
    expect(inv.slots).toEqual([{ id: 2, count: MAX_STACK }, { id: 2, count: 5 }]);

    const full = makeInv([{ id: 3, count: MAX_STACK }]);
    expect(addItem(full, 3, 10)).toBe(10);
    expect(full.slots).toEqual([{ id: 3, count: MAX_STACK }]);

    const empty = makeInv([null]);
    expect(addItem(empty, 4, MAX_STACK + 1)).toBe(1);
    expect(empty.slots).toEqual([{ id: 4, count: MAX_STACK }]);
  });

  test("does not mutate cursor or selected", () => {
    const inv = makeInv([null], 4, { id: 9, count: 2 });
    addItem(inv, 1, 1);
    expect(inv.selected).toBe(4);
    expect(inv.cursor).toEqual({ id: 9, count: 2 });
  });
});

describe("tryAddItems", () => {
  test("empty iterable succeeds without changing slots", () => {
    const inv = makeInv([{ id: 1, count: 1 }], 2, { id: 9, count: 1 });
    const before = snapshot(inv);
    expect(tryAddItems(inv, [])).toBe(true);
    expect(inv).toEqual(before);
  });

  test("all-or-nothing: restores exact inventory state when any item cannot fully fit", () => {
    const inv = makeInv(
      [{ id: 1, count: MAX_STACK }, null],
      3,
      { id: 7, count: 4 },
    );
    const before = snapshot(inv);

    expect(
      tryAddItems(inv, [
        [1, 1],
        [2, MAX_STACK + 1],
      ]),
    ).toBe(false);
    expect(inv).toEqual(before);
    expect(inv.slots).toEqual([{ id: 1, count: MAX_STACK }, null]);
    expect(inv.selected).toBe(3);
    expect(inv.cursor).toEqual({ id: 7, count: 4 });
  });

  test("commits every item when the whole batch fits", () => {
    const inv = makeInv([null, null]);
    expect(
      tryAddItems(inv, [
        [1, 2],
        [2, 3],
      ]),
    ).toBe(true);
    expect(inv.slots).toEqual([
      { id: 1, count: 2 },
      { id: 2, count: 3 },
    ]);
  });
});

describe("countItem and hasItems", () => {
  let inv: Inventory;

  beforeEach(() => {
    inv = makeInv(
      [{ id: 1, count: 3 }, null, { id: 1, count: 2 }, { id: 2, count: 4 }],
      0,
      { id: 1, count: 99 },
    );
  });

  test("countItem sums slots only and ignores the cursor", () => {
    expect(countItem(inv, 1)).toBe(5);
    expect(countItem(inv, 2)).toBe(4);
    expect(countItem(inv, 9)).toBe(0);
    // Cursor holds 99 of id 1 — still not counted.
    expect(inv.cursor).toEqual({ id: 1, count: 99 });
    expect(countItem(inv, 1)).toBe(5);
  });

  test("hasItems treats empty requirements as satisfied and ignores cursor stock", () => {
    expect(hasItems(inv, [])).toBe(true);
    expect(hasItems(inv, [[1, 5]])).toBe(true);
    expect(hasItems(inv, [[1, 6]])).toBe(false);
    expect(
      hasItems(inv, [
        [1, 5],
        [2, 4],
      ]),
    ).toBe(true);
  });
});

describe("removeItem and removeItems", () => {
  test("removeItem is a no-op success for non-positive counts", () => {
    const inv = makeInv([{ id: 1, count: 3 }]);
    expect(removeItem(inv, 1, 0)).toBe(true);
    expect(removeItem(inv, 1, -2)).toBe(true);
    expect(inv.slots).toEqual([{ id: 1, count: 3 }]);
  });

  test("removeItem leaves inventory unchanged when insufficient", () => {
    const inv = makeInv([{ id: 1, count: 2 }, { id: 1, count: 2 }], 1, {
      id: 9,
      count: 1,
    });
    const before = snapshot(inv);
    expect(removeItem(inv, 1, 5)).toBe(false);
    expect(inv).toEqual(before);
  });

  test("removeItem drains stacks left-to-right and clears emptied slots", () => {
    const inv = makeInv([{ id: 1, count: 2 }, { id: 1, count: 3 }]);
    expect(removeItem(inv, 1, 4)).toBe(true);
    expect(inv.slots).toEqual([null, { id: 1, count: 1 }]);
  });

  test("removeItems rolls back entirely when any requirement is missing", () => {
    const inv = makeInv([{ id: 1, count: 2 }, { id: 2, count: 1 }], 0, {
      id: 3,
      count: 8,
    });
    const before = snapshot(inv);
    expect(
      removeItems(inv, [
        [1, 2],
        [2, 2],
      ]),
    ).toBe(false);
    expect(inv).toEqual(before);
  });

  test("removeItems empty list succeeds; successful multi-remove mutates", () => {
    const inv = makeInv([{ id: 1, count: 2 }, { id: 2, count: 3 }]);
    expect(removeItems(inv, [])).toBe(true);
    expect(
      removeItems(inv, [
        [1, 2],
        [2, 1],
      ]),
    ).toBe(true);
    expect(inv.slots).toEqual([null, { id: 2, count: 2 }]);
  });
});

describe("tryConsumeAndAdd / canConsumeAndAdd", () => {
  test("canConsumeAndAdd never mutates and mirrors craft feasibility", () => {
    const inv = makeInv([{ id: 1, count: 2 }, null], 5, { id: 8, count: 3 });
    const before = snapshot(inv);

    expect(canConsumeAndAdd(inv, [[1, 2]], 9, 1)).toBe(true);
    expect(inv).toEqual(before);

    expect(canConsumeAndAdd(inv, [[1, 3]], 9, 1)).toBe(false);
    expect(inv).toEqual(before);

    // Feasible dry-run still leaves the live inventory untouched.
    expect(canConsumeAndAdd(inv, [[1, 1]], 9, MAX_STACK)).toBe(true);
    expect(inv).toEqual(before);
  });

  test("fails atomically when ingredients are missing", () => {
    const inv = makeInv([{ id: 1, count: 1 }, null], 2, { id: 4, count: 1 });
    const before = snapshot(inv);
    expect(tryConsumeAndAdd(inv, [[1, 2]], 9, 1)).toBe(false);
    expect(inv).toEqual(before);
  });

  test("fails atomically when the product cannot fully fit", () => {
    // Consuming one ingredient must not free a slot, and the product stack is full.
    const inv = makeInv([{ id: 1, count: 2 }, { id: 9, count: MAX_STACK }], 1, {
      id: 3,
      count: 2,
    });
    const before = snapshot(inv);
    expect(tryConsumeAndAdd(inv, [[1, 1]], 9, 1)).toBe(false);
    expect(inv).toEqual(before);
  });

  test("consumes ingredients and adds the product on success", () => {
    const inv = makeInv([{ id: 1, count: 2 }, { id: 2, count: 1 }, null]);
    expect(
      tryConsumeAndAdd(
        inv,
        [
          [1, 2],
          [2, 1],
        ],
        9,
        3,
      ),
    ).toBe(true);
    expect(inv.slots).toEqual([{ id: 9, count: 3 }, null, null]);
  });
});

describe("moveSlot", () => {
  test("rejects invalid, empty, or identical endpoints", () => {
    const inv = makeInv([{ id: 1, count: 1 }, null]);
    expect(moveSlot(inv, -2, 1)).toBe(false);
    expect(moveSlot(inv, 1, 0)).toBe(false);
    expect(moveSlot(inv, 0, 0)).toBe(false);
    expect(inv.slots).toEqual([{ id: 1, count: 1 }, null]);
  });

  test("moves into empty slots and swaps occupied slots without merging", () => {
    const inv = makeInv([
      { id: 1, count: 2 },
      null,
      { id: 1, count: 3 },
    ]);

    expect(moveSlot(inv, 0, 1)).toBe(true);
    expect(inv.slots).toEqual([null, { id: 1, count: 2 }, { id: 1, count: 3 }]);

    expect(moveSlot(inv, 1, 2)).toBe(true);
    expect(inv.slots).toEqual([null, { id: 1, count: 3 }, { id: 1, count: 2 }]);
  });

  test("SLOT_OUTSIDE clears the source slot", () => {
    expect(SLOT_OUTSIDE).toBe(-1);
    const inv = makeInv([{ id: 1, count: 4 }, { id: 2, count: 1 }]);
    expect(moveSlot(inv, 0, SLOT_OUTSIDE)).toBe(true);
    expect(inv.slots).toEqual([null, { id: 2, count: 1 }]);
  });
});

describe("cursorSlot", () => {
  test("empty cursor picks the entire stack regardless of mode", () => {
    const inv = makeInv([{ id: 1, count: 5 }, null]);

    expect(cursorSlot(inv, 0, PlaceMode.One)).toBe(true);
    expect(inv.slots[0]).toBeNull();
    expect(inv.cursor).toEqual({ id: 1, count: 5 });
  });

  test("places from cursor into an empty slot and merges into same-id stacks using amountForMode", () => {
    const inv = makeInv([null, { id: 1, count: 10 }], 0, { id: 1, count: 5 });

    expect(cursorSlot(inv, 0, PlaceMode.One)).toBe(true);
    expect(inv.slots[0]).toEqual({ id: 1, count: 1 });
    expect(inv.cursor).toEqual({ id: 1, count: 4 });

    expect(cursorSlot(inv, 1, PlaceMode.Half)).toBe(true);
    expect(inv.slots[1]).toEqual({ id: 1, count: 12 });
    expect(inv.cursor).toEqual({ id: 1, count: 2 });

    expect(cursorSlot(inv, 0, PlaceMode.All)).toBe(true);
    expect(inv.slots[0]).toEqual({ id: 1, count: 3 });
    expect(inv.cursor).toBeNull();
  });

  test("rejects merges that cannot fit any amount into a full stack", () => {
    const inv = makeInv([{ id: 1, count: MAX_STACK }], 0, { id: 1, count: 3 });
    const before = snapshot(inv);
    expect(cursorSlot(inv, 0, PlaceMode.All)).toBe(false);
    expect(inv).toEqual(before);
  });

  test("partial merge stops at MAX_STACK and leaves remainder on the cursor", () => {
    const inv = makeInv([{ id: 1, count: MAX_STACK - 2 }], 0, {
      id: 1,
      count: 5,
    });
    expect(cursorSlot(inv, 0, PlaceMode.All)).toBe(true);
    expect(inv.slots[0]).toEqual({ id: 1, count: MAX_STACK });
    expect(inv.cursor).toEqual({ id: 1, count: 3 });
  });

  test("swaps when cursor and slot hold different items", () => {
    const inv = makeInv([{ id: 1, count: 2 }], 0, { id: 2, count: 5 });
    expect(cursorSlot(inv, 0, PlaceMode.All)).toBe(true);
    expect(inv.slots[0]).toEqual({ id: 2, count: 5 });
    expect(inv.cursor).toEqual({ id: 1, count: 2 });
  });

  test("drops the cursor outside and rejects empty-cursor outside drops", () => {
    const inv = makeInv([{ id: 1, count: 1 }], 0, { id: 2, count: 3 });
    expect(cursorSlot(inv, SLOT_OUTSIDE, PlaceMode.All)).toBe(true);
    expect(inv.cursor).toBeNull();
    expect(inv.slots[0]).toEqual({ id: 1, count: 1 });

    expect(cursorSlot(inv, SLOT_OUTSIDE, PlaceMode.All)).toBe(false);
  });
});
