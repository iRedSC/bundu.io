import { Container, Graphics } from "pixi.js";
import { SpriteFactory, type ContaineredSprite } from "../assets/sprite_factory";
import { ITEM_BUTTON_SIZE } from "../constants";
import { percentOf } from "@bundu/shared/math";
import {
    LOCK_ANY_ITEM,
    LOCK_SLOTS,
    lockFlagsToActions,
    lockSlotFlagsToSlots,
    type LockAction,
} from "@bundu/shared/item_lock";
import {
    clientRegistries,
    clientItemModelId,
} from "../configs/registries";
import { mountSlotIcon } from "../models/mount";
import {
    colorLerp,
    lerp,
    radians,
    rotationLerp,
} from "@bundu/shared/transforms";

export type ItemButtonColors = {
    empty: number;
    default: number;
    hover: number;
    down: number;
    rightDown: number;
};

/** Structural surface shared by inventory ItemButton and admin palette slots. */
export type ItemButtonLike = {
    background: { rotation: number; position: { y: number }; tint: number };
    itemDisplay: { position: { y: number } };
    button: { scale: { x: number; set: (value: number) => void } };
    item: number | null;
    hovering: boolean;
    down: boolean;
    rightDown: boolean;
};

/** Tween hover/press/idle scale+tint+wobble from interaction state. */
export function tickItemButton(
    button: ItemButtonLike,
    colors: ItemButtonColors,
    restY = 0,
    restScale = 1,
    now = performance.now()
) {
    button.background.rotation = lerp(
        button.background.rotation,
        radians(0),
        0.2
    );
    button.background.position.y = lerp(
        button.background.position.y,
        restY,
        0.2
    );
    button.itemDisplay.position.y = lerp(
        button.itemDisplay.position.y,
        restY,
        0.2
    );

    if (button.rightDown) {
        button.button.scale.set(lerp(button.button.scale.x, 1.3, 0.2));
        button.background.tint = colorLerp(
            Number(button.background.tint),
            colors.hover,
            0.2
        );
        return;
    }

    if (button.down && button.item) {
        button.button.scale.set(lerp(button.button.scale.x, 0.8, 0.2));
        button.background.tint = colorLerp(
            Number(button.background.tint),
            colors.down,
            0.2
        );
        return;
    }
    if (button.hovering) {
        button.background.rotation = rotationLerp(
            button.background.rotation,
            Math.sin(now / 500) * 0.3,
            0.2
        );
        button.button.scale.set(lerp(button.button.scale.x, 1.1, 0.1));
        button.background.tint = colorLerp(
            Number(button.background.tint),
            button.item ? colors.hover : colors.default,
            0.1
        );
        return;
    }

    button.button.scale.set(lerp(button.button.scale.x, restScale, 0.1));
    if (button.item) {
        button.background.tint = colorLerp(
            Number(button.background.tint),
            colors.default,
            0.1
        );
        return;
    }
    button.background.tint = colorLerp(
        Number(button.background.tint),
        colors.empty,
        0.1
    );
}

export type ItemLockVisual = {
    /**
     * Registry item id, or `LOCK_ANY_ITEM` (-1) for slot-only locks.
     */
    itemId: number;
    /** `performance.now()` when the lock ends; `Infinity` = until unlock. */
    endsAt: number;
    /** Authored duration; 0 when permanent. */
    durationMs: number;
    /** Bitmask of restricted actions (see `@bundu/shared/item_lock`). */
    flags: number;
    /** Bitmask of equipment slots this lock applies to. */
    slotFlags: number;
};

const LOCK_FLASH_MS = 1200;
/** Centered icon while a restriction is actively applied / flashing. */
const LOCK_ICON_ACTIVE = ITEM_BUTTON_SIZE * 0.42;
/** Corner badge while locked actions exist but none are active on this slot. */
const LOCK_ICON_BADGE = ITEM_BUTTON_SIZE * 0.26;
const LOCK_BADGE_INSET = 3;
/**
 * Wipe radius past the button edge so the pie fills the face and clipping
 * against the button mask is obvious.
 */
const LOCK_WIPE_RADIUS = ITEM_BUTTON_SIZE * 1.25;

function formatActionList(actions: readonly LockAction[]): string {
    if (actions.length === 1) return actions[0]!;
    if (actions.length === 2) return `${actions[0]} or ${actions[1]}`;
    return `${actions.slice(0, -1).join(", ")}, or ${actions[actions.length - 1]}`;
}

/** Tooltip line describing lock restrictions. */
export function formatItemLockTooltip(
    lock: ItemLockVisual,
    now = performance.now()
): string {
    const actions = lockFlagsToActions(lock.flags);
    if (actions.length === 0) return "";
    const slots = lockSlotFlagsToSlots(lock.slotFlags);
    const slotSuffix =
        slots.length > 0 && slots.length < LOCK_SLOTS.length
            ? ` (${slots.join(", ")})`
            : "";
    let time = "";
    if (lock.endsAt === Number.POSITIVE_INFINITY) {
        time = " until unlocked";
    } else {
        const secs = Math.max(0, Math.ceil((lock.endsAt - now) / 1000));
        if (secs > 0) time = ` · ${secs}s left`;
    }
    return `Can't ${formatActionList(actions)}${slotSuffix}${time}`;
}

/**
 * Collapse overlapping lock visuals: flags OR'd, timer = latest expiry
 * (duration from the rule that owns that expiry).
 */
export function mergeItemLockVisuals(
    locks: readonly ItemLockVisual[]
): ItemLockVisual | undefined {
    if (locks.length === 0) return undefined;
    if (locks.length === 1) return locks[0];
    let itemId = LOCK_ANY_ITEM;
    let endsAt = 0;
    let durationMs = 0;
    let flags = 0;
    let slotFlags = 0;
    for (const lock of locks) {
        if (lock.itemId !== LOCK_ANY_ITEM) itemId = lock.itemId;
        flags |= lock.flags;
        slotFlags |= lock.slotFlags;
        if (lock.endsAt > endsAt) {
            endsAt = lock.endsAt;
            durationMs = lock.durationMs;
        }
    }
    return { itemId, endsAt, durationMs, flags, slotFlags };
}

export class ItemButton {
    button: Container;
    enabled: boolean = true;
    sendEvents: boolean = true;

    background: ContaineredSprite;

    disableSprite: ContaineredSprite;
    /** Icon content root (texture sprite or assembled `model:` def). */
    itemDisplay: Container;
    /** Dark circular wipe + lock icon while the stack's item is locked. */
    private lockOverlay: Container;
    /** Wipe only — masked to the button face; icon stays unmasked. */
    private lockWipeLayer: Container;
    private lockWipe: Graphics;
    private lockIcon: ContaineredSprite;
    /** Opaque shape used to clip the wipe. */
    private lockMask: Graphics;
    /** Small bottom-right lock when restrictions exist but aren't active yet. */
    private lockBadge: ContaineredSprite;
    private lockVisual: ItemLockVisual | null = null;
    /** Show wipe+icon while the restriction currently applies (equip/unequip/drop). */
    private lockPersistent = false;
    /** Force-show until this `performance.now()` (use/craft deny flash). */
    private lockFlashUntil = 0;

    hovering: boolean = false;
    down: boolean = false;
    rightDown: boolean = false;
    private _item: number | null = null;
    private _touchDown: boolean = false;
    private clearIcon: (() => void) | undefined;

    rightclick?: (item: number, shift: boolean) => void;
    leftclick?: (item: number, shift: boolean) => void;
    /** Fired after `hovering` updates (tooltips, etc.). */
    onHover?: (
        hovering: boolean,
        ev?: { global: { x: number; y: number } }
    ) => void;
    onHoverMove?: (ev: { global: { x: number; y: number } }) => void;

    /** @deprecated Prefer `itemDisplay` — kept for callers that still expect a sprite. */
    get itemSprite(): Container {
        return this.itemDisplay;
    }

    constructor() {
        this.button = new Container();
        this.button.sortableChildren = true;
        this.button.eventMode = "static";

        this.background = SpriteFactory.build("bundu/ui/item_button.png");
        this.background.width = ITEM_BUTTON_SIZE;
        this.background.height = ITEM_BUTTON_SIZE;
        this.background.tint = 0x777777;
        this.background.anchor.set(0.5);

        this.disableSprite = SpriteFactory.build("bundu/ui/item_button.png");

        this.disableSprite.width = ITEM_BUTTON_SIZE;
        this.disableSprite.height = ITEM_BUTTON_SIZE;
        this.disableSprite.tint = 0x000000;
        this.disableSprite.alpha = 0.5;
        this.disableSprite.zIndex = 1000;
        this.disableSprite.visible = false;
        this.disableSprite.anchor.set(0.5);

        this.itemDisplay = new Container();
        this.itemDisplay.zIndex = 1;

        this.lockWipe = new Graphics();
        this.lockWipe.zIndex = 0;
        this.lockIcon = SpriteFactory.build("bundu/ui/item_lock.png");
        this.lockIcon.anchor.set(0.5);
        this.lockIcon.width = LOCK_ICON_ACTIVE;
        this.lockIcon.height = LOCK_ICON_ACTIVE;
        this.lockIcon.zIndex = 1;

        // Opaque mask — button texture is 50% alpha and would hide the wipe.
        const corner = ITEM_BUTTON_SIZE * 0.18;
        this.lockMask = new Graphics()
            .roundRect(
                -ITEM_BUTTON_SIZE / 2,
                -ITEM_BUTTON_SIZE / 2,
                ITEM_BUTTON_SIZE,
                ITEM_BUTTON_SIZE,
                corner
            )
            .fill(0xffffff);
        this.lockWipeLayer = new Container();
        this.lockWipeLayer.addChild(this.lockWipe);
        this.lockWipeLayer.addChild(this.lockMask);
        this.lockWipeLayer.mask = this.lockMask;

        this.lockOverlay = new Container();
        this.lockOverlay.sortableChildren = true;
        this.lockOverlay.zIndex = 900;
        this.lockOverlay.visible = false;
        this.lockOverlay.addChild(this.lockWipeLayer);
        this.lockOverlay.addChild(this.lockIcon);

        // Bottom-right corner (amount sits bottom-left).
        this.lockBadge = SpriteFactory.build("bundu/ui/item_lock.png");
        this.lockBadge.anchor.set(1, 1);
        this.lockBadge.width = LOCK_ICON_BADGE;
        this.lockBadge.height = LOCK_ICON_BADGE;
        this.lockBadge.position.set(
            ITEM_BUTTON_SIZE / 2 - LOCK_BADGE_INSET,
            ITEM_BUTTON_SIZE / 2 - LOCK_BADGE_INSET
        );
        this.lockBadge.zIndex = 3;
        this.lockBadge.visible = false;

        this.button.addChild(this.itemDisplay);
        this.button.addChild(this.background);
        this.button.addChild(this.lockOverlay);
        this.button.addChild(this.lockBadge);
        this.button.addChild(this.disableSprite);
        this.button.sortChildren();

        this.button.onpointerenter = (ev) => {
            this.hovering = true;
            this.onHover?.(true, ev);
        };

        this.button.onpointermove = (ev) => {
            if (this.hovering) this.onHoverMove?.(ev);
        };

        this.button.onpointerleave = () => {
            this.hovering = false;
            if (this._touchDown) {
                this.rightDown = true;
            }
            this.onHover?.(false);
        };

        this.button.onpointerdown = (ev) => {
            if (ev?.button === 2) {
                this.rightDown = true;
            }
            this.down = true;
        };

        this.button.ontouchstart = () => {
            this._touchDown = true;
        };

        this.button.ontouchendoutside = (ev) => {
            if (this.rightclick && this.item !== null) {
                this.rightclick(this.item, ev?.shiftKey ?? false);
            }
            this.down = false;
            this.rightDown = false;
            this._touchDown = false;
        };

        this.button.onpointerup = (ev) => {
            if (ev?.button === 2) {
                if (this.rightclick && this.item !== null && this.sendEvents) {
                    this.rightclick(this.item, ev?.shiftKey ?? false);
                }
            } else if (ev?.button === 0 && this.sendEvents) {
                // Fire even for empty slots (hotbar select / unequip).
                if (this.leftclick) {
                    this.leftclick(this.item ?? -1, ev?.shiftKey ?? false);
                }
            }
            this.down = false;
            this.rightDown = false;
            this._touchDown = false;
        };

        this.button.onpointerupoutside = () => {
            this.down = false;
            this.rightDown = false;
            this._touchDown = false;
        };
    }

    disable() {
        this.enabled = false;
        this.disableSprite.visible = true;
        this.button.eventMode = "none";
    }

    enable() {
        this.enabled = true;
        this.disableSprite.visible = false;
        this.button.eventMode = "static";
    }

    /**
     * @param persistent - show wipe+icon while the restriction applies now
     *   (e.g. equip lock while unequipped). Otherwise a corner badge stays
     *   visible for inactive locked actions until {@link flashLock}.
     */
    setItemLock(visual: ItemLockVisual | null, persistent = false) {
        this.lockVisual = visual;
        this.lockPersistent = persistent && visual !== null;
        if (!visual) {
            this.lockFlashUntil = 0;
            this.lockOverlay.visible = false;
            this.lockBadge.visible = false;
            this.lockWipe.clear();
            return;
        }
        this.syncLockOverlay(performance.now());
    }

    /** Current lock state for tooltips (null when unlocked). */
    get itemLock(): ItemLockVisual | null {
        return this.lockVisual;
    }

    /** Briefly force-show the lock overlay (denied use/craft). */
    flashLock(ms = LOCK_FLASH_MS, now = performance.now()) {
        if (!this.lockVisual) return;
        this.lockFlashUntil = Math.max(this.lockFlashUntil, now + ms);
        this.syncLockOverlay(now);
    }

    /** Redraw circular wipe from remaining lock time. Returns true if still locked. */
    tickLock(now = performance.now()): boolean {
        if (!this.lockVisual) {
            if (this.lockOverlay.visible || this.lockBadge.visible) {
                this.lockOverlay.visible = false;
                this.lockBadge.visible = false;
                this.lockWipe.clear();
            }
            return false;
        }
        if (
            this.lockVisual.endsAt !== Number.POSITIVE_INFINITY &&
            now >= this.lockVisual.endsAt
        ) {
            this.lockVisual = null;
            this.lockPersistent = false;
            this.lockFlashUntil = 0;
            this.lockOverlay.visible = false;
            this.lockBadge.visible = false;
            this.lockWipe.clear();
            return false;
        }
        this.syncLockOverlay(now);
        return (
            this.lockOverlay.visible ||
            this.lockBadge.visible ||
            this.lockPersistent
        );
    }

    private syncLockOverlay(now: number) {
        const flashing = now < this.lockFlashUntil;
        const showActive =
            this.lockVisual !== null && (this.lockPersistent || flashing);
        this.lockOverlay.visible = showActive;
        // Inactive locked actions → small corner badge (hidden while active/flash).
        this.lockBadge.visible = this.lockVisual !== null && !showActive;
        if (!showActive || !this.lockVisual) {
            this.lockWipe.clear();
            return;
        }
        this.redrawLockWipe(now);
    }

    private redrawLockWipe(now: number) {
        const visual = this.lockVisual;
        if (!visual) return;
        let remaining = 1;
        if (
            visual.durationMs > 0 &&
            visual.endsAt !== Number.POSITIVE_INFINITY
        ) {
            remaining = Math.max(
                0,
                Math.min(1, (visual.endsAt - now) / visual.durationMs)
            );
        }
        const radius = LOCK_WIPE_RADIUS;
        this.lockWipe.clear();
        this.lockWipe
            .moveTo(0, 0)
            .arc(
                0,
                0,
                radius,
                -Math.PI / 2,
                -Math.PI / 2 + Math.PI * 2 * remaining
            )
            .lineTo(0, 0)
            .fill({ color: 0x000000, alpha: 0.55 });
    }

    set item(item: number | null) {
        this.clearIcon?.();
        this.clearIcon = undefined;

        if (item === null) {
            this._item = null;
            this.itemDisplay.visible = false;
            this.setItemLock(null);
            return;
        }

        const name = clientItemModelId(clientRegistries().item.location(item));
        this._item = item;
        this.itemDisplay.visible = true;
        this.clearIcon = mountSlotIcon(
            name,
            this.itemDisplay,
            percentOf(90, ITEM_BUTTON_SIZE)
        );
    }

    get item() {
        return this._item;
    }

    get position() {
        return this.button.position;
    }

    destroy(): void {
        this.clearIcon?.();
        this.button.removeAllListeners();
        this.button.onpointerenter = null;
        this.button.onpointermove = null;
        this.button.onpointerleave = null;
        this.button.onpointerdown = null;
        this.button.onpointerup = null;
        this.button.onpointerupoutside = null;
        this.button.ontouchstart = null;
        this.button.ontouchendoutside = null;

        this.background.destroy();
        this.disableSprite.destroy();
        this.lockWipe.destroy();
        this.lockIcon.destroy();
        this.lockWipeLayer.mask = null;
        this.lockMask.destroy();
        this.lockWipeLayer.destroy({ children: false });
        this.lockBadge.destroy();
        this.lockOverlay.destroy({ children: false });
        this.itemDisplay.destroy({ children: true });
        this.button.destroy({ children: false });
    }
}

export { LOCK_FLASH_MS };
