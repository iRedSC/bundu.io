import { beforeEach, describe, expect, test } from "bun:test";
import { ItemLocks } from "@bundu/server/components/item_locks";
import { PlayerData } from "@bundu/server/components/player";
import type {
  EquipEventTarget,
  LockItemAction,
} from "@bundu/server/configs/loaders/equip_events";
import { GameObject } from "@bundu/server/engine";
import { ServerPacket } from "@bundu/shared/packet_definitions";
import {
  applyLockItem,
  applyResolvedEquipEvents,
  applyUnlockItem,
  clearPlayerItemLocks,
  emitItemLocks,
  findLock,
  inventoryHasLockedIngredient,
  isItemLocked,
  pruneExpiredLocks,
} from "@bundu/server/network/item_locks";

class Player extends GameObject {}

function player(): Player {
  return new Player().add(new PlayerData()).add(new ItemLocks()) as Player;
}

function lock(
  overrides: Partial<LockItemAction> = {},
): LockItemAction {
  return {
    source: "test",
    items: new Set([10]),
    lock: ["use"],
    slots: ["mainhand"],
    ...overrides,
  };
}

function eventTarget(
  events: Pick<EquipEventTarget, "lockItems" | "unlockItems">,
): EquipEventTarget {
  return {
    all: false,
    base: "s",
    types: new Set(),
    clauses: [],
    ...events,
  };
}

describe("item lock runtime", () => {
  let target: Player;

  beforeEach(() => {
    target = player();
  });

  test("creates one normalized rule per action, item, and slot", () => {
    applyLockItem(
      target,
      lock({
        items: new Set([10, 20]),
        lock: ["equip", "unequip", "drop"],
        slots: ["mainhand", "helmet"],
        forMs: 500,
      }),
      1_000,
    );

    expect(ItemLocks.get(target).rules).toHaveLength(10);
    expect(findLock(target, { action: "equip", itemId: 20, slot: "helmet" }, 1_499))
      .toMatchObject({
        source: "test",
        itemId: 20,
        endsAt: 1_500,
        durationMs: 500,
      });
    expect(isItemLocked(target, { action: "drop", itemId: 10 }, 1_499)).toBe(true);
    expect(isItemLocked(target, { action: "drop", itemId: 20 }, 1_500)).toBe(false);
  });

  test("slot-only rules match any item only in their authored slot", () => {
    applyLockItem(
      target,
      lock({ items: null, lock: ["use"], slots: ["offhand"] }),
      0,
    );

    expect(
      isItemLocked(target, { action: "use", itemId: 999, slot: "offhand" }, 10),
    ).toBe(true);
    expect(
      isItemLocked(target, { action: "use", itemId: 999, slot: "mainhand" }, 10),
    ).toBe(false);
    expect(ItemLocks.get(target).rules).toHaveLength(1);
  });

  test("refreshing the same source replaces duration without merging stale state", () => {
    applyLockItem(target, lock({ forMs: 1_000 }), 0);
    applyLockItem(target, lock({ forMs: 100 }), 50);

    expect(ItemLocks.get(target).rules).toHaveLength(1);
    expect(
      findLock(target, { action: "use", itemId: 10, slot: "mainhand" }, 149),
    ).toMatchObject({ endsAt: 150, durationMs: 100 });
    expect(
      findLock(target, { action: "use", itemId: 10, slot: "mainhand" }, 150),
    ).toBeUndefined();
  });

  test("source unlock removes exactly that source and is idempotent", () => {
    applyLockItem(target, lock({ source: "first" }), 0);
    applyLockItem(target, lock({ source: "second" }), 0);

    expect(
      applyUnlockItem(target, {
        source: "first",
        items: null,
      }),
    ).toBe(true);
    expect(ItemLocks.get(target).rules).toHaveLength(1);
    expect([...ItemLocks.get(target).rules.values()][0]?.source).toBe("second");
    expect(
      applyUnlockItem(target, {
        source: "first",
        items: null,
      }),
    ).toBe(false);
  });

  test("criteria unlock intersects item and slot without corrupting other rules", () => {
    applyLockItem(
      target,
      lock({
        items: new Set([10, 20]),
        slots: ["mainhand", "helmet"],
      }),
      0,
    );

    expect(
      applyUnlockItem(target, {
        items: new Set([10]),
        slots: ["helmet"],
      }),
    ).toBe(true);
    expect(
      isItemLocked(target, { action: "use", itemId: 10, slot: "helmet" }, 1),
    ).toBe(false);
    expect(
      isItemLocked(target, { action: "use", itemId: 10, slot: "mainhand" }, 1),
    ).toBe(true);
    expect(
      isItemLocked(target, { action: "use", itemId: 20, slot: "helmet" }, 1),
    ).toBe(true);
  });

  test("prunes only expired rules and reports whether state changed", () => {
    applyLockItem(target, lock({ source: "short", forMs: 10 }), 100);
    applyLockItem(target, lock({ source: "permanent" }), 100);

    expect(pruneExpiredLocks(target, 109)).toBe(false);
    expect(pruneExpiredLocks(target, 110)).toBe(true);
    expect(pruneExpiredLocks(target, 1_000)).toBe(false);
    expect([...ItemLocks.get(target).rules.values()][0]?.source).toBe("permanent");
  });

  test("emits owner-only wire tuples with remaining and permanent durations", () => {
    applyLockItem(
      target,
      lock({
        source: "timed",
        items: new Set([20]),
        lock: ["drop"],
        forMs: 250,
      }),
      1_000,
    );
    applyLockItem(
      target,
      lock({
        source: "slot",
        items: null,
        lock: ["unequip"],
        slots: ["helmet"],
      }),
      1_000,
    );
    const sent: Array<readonly unknown[]> = [];
    const manager = {
      set: (...args: readonly unknown[]) => {
        sent.push(args);
      },
    } as unknown as Parameters<typeof emitItemLocks>[2];

    emitItemLocks(target, 1_100, manager);

    expect(sent).toEqual([
      [
        target.id,
        ServerPacket.UpdateItemLocks,
        {
          locks: [
            [20, 150, 250, 8, 0],
            [-1, -1, 0, 2, 4],
          ],
        },
      ],
    ]);
  });

  test("treats undefined equipped requests as unlocked", () => {
    applyLockItem(target, lock(), 0);

    expect(isItemLocked(target, undefined, 1)).toBe(false);
  });

  test("detects a craft lock on any required ingredient", () => {
    applyLockItem(
      target,
      lock({
        items: new Set([20]),
        lock: ["craft"],
        slots: ["mainhand"],
      }),
      0,
    );

    expect(
      inventoryHasLockedIngredient(target, new Map([[10, 1], [20, 2]]), 1),
    ).toBe(true);
    expect(inventoryHasLockedIngredient(target, new Map([[10, 1]]), 1)).toBe(
      false,
    );
  });

  test("clear removes every lock without replacing component-owned state", () => {
    const state = ItemLocks.get(target);
    applyLockItem(target, lock(), 0);

    clearPlayerItemLocks(target);

    expect(ItemLocks.get(target)).toBe(state);
    expect(state.rules.size).toBe(0);
  });
});

describe("resolved equipment lock ownership", () => {
  test("keeps identical authored sources independent per executor", () => {
    const target = player();
    const firstExecutor = player();
    const secondExecutor = player();
    const action = lock({ source: "bundu:item:onEquip.lock" });
    const events = eventTarget({
      lockItems: [action],
      unlockItems: [],
    });

    expect(
      applyResolvedEquipEvents(
        [
          { target, events, executorId: firstExecutor.id },
          { target, events, executorId: secondExecutor.id },
        ],
        0,
      ),
    ).toEqual([target]);
    expect(ItemLocks.get(target).rules).toHaveLength(2);

    const unlockEvents = eventTarget({
      lockItems: [],
      unlockItems: [
        {
          source: action.source,
          items: null,
        },
      ],
    });
    applyResolvedEquipEvents(
      [{ target, events: unlockEvents, executorId: firstExecutor.id }],
      1,
    );

    expect(ItemLocks.get(target).rules).toHaveLength(1);
    expect([...ItemLocks.get(target).rules.values()][0]?.source).toBe(
      `${secondExecutor.id}:${action.source}`,
    );
  });
});
