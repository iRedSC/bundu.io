/** Actions that `lockItem.lock` can restrict. */
export const LOCK_ACTIONS = [
    "equip",
    "unequip",
    "use",
    "drop",
    "craft",
] as const;

export type LockAction = (typeof LOCK_ACTIONS)[number];

/** Equipment slots that `lockItem.slots` can target. */
export const LOCK_SLOTS = ["mainhand", "offhand", "helmet"] as const;

export type LockSlot = (typeof LOCK_SLOTS)[number];

const LOCK_BITS: Record<LockAction, number> = {
    equip: 1 << 0,
    unequip: 1 << 1,
    use: 1 << 2,
    drop: 1 << 3,
    craft: 1 << 4,
};

const SLOT_BITS: Record<LockSlot, number> = {
    mainhand: 1 << 0,
    offhand: 1 << 1,
    helmet: 1 << 2,
};

/** All slots bit — used when `slots` is omitted. */
export const LOCK_SLOTS_ALL =
    SLOT_BITS.mainhand | SLOT_BITS.offhand | SLOT_BITS.helmet;

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

export function lockSlotsToFlags(slots: readonly LockSlot[]): number {
    let flags = 0;
    for (const slot of slots) {
        flags |= SLOT_BITS[slot];
    }
    return flags;
}

export function lockSlotFlagsHas(
    flags: number,
    slot: LockSlot
): boolean {
    return (flags & SLOT_BITS[slot]) !== 0;
}

export function lockSlotFlagsToSlots(flags: number): LockSlot[] {
    const out: LockSlot[] = [];
    for (const slot of LOCK_SLOTS) {
        if (lockSlotFlagsHas(flags, slot)) out.push(slot);
    }
    return out;
}

export function isLockSlot(value: string): value is LockSlot {
    return (LOCK_SLOTS as readonly string[]).includes(value);
}

/** Wire sentinel itemId for slot-only locks (any item in the given slots). */
export const LOCK_ANY_ITEM = -1;

/** Map item `function` → lock slot (undefined = not equippable). */
export function lockSlotForItemFunction(
    fn: string | null | undefined
): LockSlot | undefined {
    switch (fn) {
        case "main_hand":
        case "building":
            return "mainhand";
        case "off_hand":
            return "offhand";
        case "wear":
            return "helmet";
        default:
            return undefined;
    }
}
