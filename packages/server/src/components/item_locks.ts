import type { LockAction, LockSlot } from "@bundu/shared/item_lock";
import { Component } from "../engine";

export type EquippedLockAction = "equip" | "unequip" | "use";
export type InventoryLockAction = "drop" | "craft";

type LockRuleBase = {
    itemId: number | null;
    endsAt: number;
    durationMs: number;
    source: string;
};

export type ItemLockRule =
    | (LockRuleBase & {
          action: EquippedLockAction;
          slot: LockSlot;
      })
    | (LockRuleBase & {
          action: InventoryLockAction;
      });

export type ItemLockRequest =
    | {
          action: EquippedLockAction;
          itemId: number;
          slot: LockSlot;
      }
    | {
          action: InventoryLockAction;
          itemId: number;
      };

export type ItemLockState = {
    rules: Map<string, ItemLockRule>;
};

export const ItemLocks = Component.register<ItemLockState>(() => ({
    rules: new Map(),
}));

export function isEquippedLockAction(
    action: LockAction
): action is EquippedLockAction {
    return action === "equip" || action === "unequip" || action === "use";
}

export function equippedLockRequest(
    action: EquippedLockAction,
    itemId: number | undefined,
    slot: LockSlot
): ItemLockRequest | undefined {
    return itemId === undefined ? undefined : { action, itemId, slot };
}
