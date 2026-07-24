/** Actions that `lockItem.lock` can restrict. */
export const LOCK_ACTIONS = [
    "equip",
    "unequip",
    "use",
    "drop",
    "craft",
] as const;

export type LockAction = (typeof LOCK_ACTIONS)[number];

const LOCK_BITS: Record<LockAction, number> = {
    equip: 1 << 0,
    unequip: 1 << 1,
    use: 1 << 2,
    drop: 1 << 3,
    craft: 1 << 4,
};

export function lockActionsToFlags(
    actions: readonly LockAction[]
): number {
    let flags = 0;
    for (const action of actions) {
        flags |= LOCK_BITS[action];
    }
    return flags;
}

export function lockFlagsHas(
    flags: number,
    action: LockAction
): boolean {
    return (flags & LOCK_BITS[action]) !== 0;
}

export function lockFlagsToActions(flags: number): LockAction[] {
    const out: LockAction[] = [];
    for (const action of LOCK_ACTIONS) {
        if (lockFlagsHas(flags, action)) out.push(action);
    }
    return out;
}

export function isLockAction(value: string): value is LockAction {
    return (LOCK_ACTIONS as readonly string[]).includes(value);
}
