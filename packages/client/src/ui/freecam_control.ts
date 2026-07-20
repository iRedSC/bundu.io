import { Container, Graphics, Text } from "pixi.js";
import { SpriteFactory } from "../assets/sprite_factory";
import { ITEM_BUTTON_SIZE } from "../constants";

const UI_FONT = "'Aoboshi One', sans-serif";
const MARGIN = 20;
const DRAG_THRESHOLD = 8;
const PLAYER_ICON = "bundu/entity/player/player.png";
const ICON_SIZE = 44;

export type FreecamControl = {
    container: Container;
    setAvailable: (available: boolean) => void;
    setFreecamActive: (active: boolean) => void;
    setInGame: (inGame: boolean) => void;
    containsPoint: (screenX: number, screenY: number) => boolean;
    isDragging: () => boolean;
    destroy: () => void;
};

/**
 * Bottom-right freecam control for op-4 players.
 * Idle: enter button. Freecam: player icon — click exits, drag-drop relocates.
 */
export function createFreecamControl(handlers: {
    onEnter: () => void;
    onExit: () => void;
    onExitAt: (screenX: number, screenY: number) => void;
    /** True when release should not relocate (palette / toolbar / etc.). */
    isBlockedDrop: (screenX: number, screenY: number) => boolean;
}): FreecamControl {
    const container = new Container();
    container.eventMode = "static";
    container.zIndex = 200;
    container.visible = false;

    let available = false;
    let freecamActive = false;
    let inGame = false;

    const enterBtn = makeEnterButton(() => {
        if (!freecamActive) handlers.onEnter();
    });
    container.addChild(enterBtn.root);

    const iconRoot = new Container();
    iconRoot.eventMode = "static";
    iconRoot.cursor = "grab";
    iconRoot.visible = false;
    const iconBg = new Graphics();
    iconBg.roundRect(-ICON_SIZE / 2, -ICON_SIZE / 2, ICON_SIZE, ICON_SIZE, 8)
        .fill({ color: 0x2e3428, alpha: 0.92 });
    const icon = SpriteFactory.build(PLAYER_ICON);
    icon.width = ICON_SIZE * 0.78;
    icon.height = ICON_SIZE * 0.78;
    icon.anchor.set(0.5);
    iconRoot.addChild(iconBg);
    iconRoot.addChild(icon);
    container.addChild(iconRoot);

    const ghost = SpriteFactory.build(PLAYER_ICON);
    ghost.width = ICON_SIZE * 0.78;
    ghost.height = ICON_SIZE * 0.78;
    ghost.anchor.set(0.5);
    ghost.visible = false;
    ghost.eventMode = "none";
    container.addChild(ghost);

    let pressId: number | null = null;
    let pressX = 0;
    let pressY = 0;
    let dragging = false;

    const syncVisibility = () => {
        const show = available && inGame;
        container.visible = show;
        if (!show) {
            cancelDrag();
            return;
        }
        enterBtn.root.visible = !freecamActive;
        iconRoot.visible = freecamActive && !dragging;
        layout();
    };

    const layout = () => {
        const x = window.innerWidth - MARGIN - ITEM_BUTTON_SIZE / 2;
        const y = window.innerHeight - MARGIN - ITEM_BUTTON_SIZE / 2;
        enterBtn.root.position.set(x, y);
        iconRoot.position.set(x, y);
    };

    const cancelDrag = () => {
        pressId = null;
        dragging = false;
        ghost.visible = false;
        iconRoot.alpha = 1;
        iconRoot.cursor = "grab";
        if (available && inGame && freecamActive) {
            iconRoot.visible = true;
        }
    };

    const onPointerMove = (event: PointerEvent) => {
        if (pressId === null || event.pointerId !== pressId) return;
        const dx = event.clientX - pressX;
        const dy = event.clientY - pressY;
        if (
            !dragging &&
            dx * dx + dy * dy >= DRAG_THRESHOLD * DRAG_THRESHOLD
        ) {
            dragging = true;
            iconRoot.visible = false;
            iconRoot.alpha = 0.35;
            ghost.visible = true;
            iconRoot.cursor = "grabbing";
        }
        if (dragging) {
            ghost.position.set(event.clientX, event.clientY);
        }
    };

    const onPointerUp = (event: PointerEvent) => {
        if (pressId === null || event.pointerId !== pressId) return;
        const wasDragging = dragging;
        const x = event.clientX;
        const y = event.clientY;
        cancelDrag();
        if (!freecamActive) return;
        if (!wasDragging) {
            handlers.onExit();
            return;
        }
        if (handlers.isBlockedDrop(x, y)) return;
        handlers.onExitAt(x, y);
    };

    const onPointerCancel = (event: PointerEvent) => {
        if (pressId === null || event.pointerId !== pressId) return;
        // Interrupted gesture — never treat as click-exit or drop-exit.
        cancelDrag();
    };

    iconRoot.onpointerdown = (event: {
        pointerId: number;
        clientX: number;
        clientY: number;
        stopPropagation(): void;
        preventDefault(): void;
    }) => {
        event.stopPropagation();
        event.preventDefault();
        if (!freecamActive) return;
        pressId = event.pointerId;
        pressX = event.clientX;
        pressY = event.clientY;
        dragging = false;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("resize", layout);
    layout();
    syncVisibility();

    return {
        container,
        setAvailable(next) {
            available = next;
            syncVisibility();
        },
        setFreecamActive(next) {
            freecamActive = next;
            cancelDrag();
            syncVisibility();
        },
        setInGame(next) {
            inGame = next;
            syncVisibility();
        },
        containsPoint(screenX, screenY) {
            if (!container.visible) return false;
            const target = freecamActive ? iconRoot : enterBtn.root;
            if (!target.visible && !dragging) return false;
            const bounds = target.getBounds();
            const pad = 8;
            return (
                screenX >= bounds.x - pad &&
                screenX <= bounds.x + bounds.width + pad &&
                screenY >= bounds.y - pad &&
                screenY <= bounds.y + bounds.height + pad
            );
        },
        isDragging: () => dragging,
        destroy() {
            window.removeEventListener("pointermove", onPointerMove);
            window.removeEventListener("pointerup", onPointerUp);
            window.removeEventListener("pointercancel", onPointerCancel);
            window.removeEventListener("resize", layout);
            cancelDrag();
            enterBtn.destroy();
            icon.destroy();
            ghost.destroy();
            container.destroy({ children: true });
        },
    };
}

function makeEnterButton(onClick: () => void): {
    root: Container;
    destroy: () => void;
} {
    const root = new Container();
    root.eventMode = "static";
    root.cursor = "pointer";

    const bg = new Graphics();
    const text = new Text({
        text: "Freecam",
        style: { fontFamily: UI_FONT, fill: "#ffffff", fontSize: 14 },
    });
    text.anchor.set(0.5);
    root.addChild(bg);
    root.addChild(text);

    const w = Math.max(ITEM_BUTTON_SIZE + 16, text.width + 24);
    const h = 36;
    bg.roundRect(-w / 2, -h / 2, w, h, 6).fill({ color: 0x2e3428, alpha: 0.92 });
    root.hitArea = {
        contains: (x: number, y: number) =>
            x >= -w / 2 && x <= w / 2 && y >= -h / 2 && y <= h / 2,
    };

    root.onpointerdown = (e: { stopPropagation(): void }) => e.stopPropagation();
    root.onpointerup = (e: { stopPropagation(): void }) => {
        e.stopPropagation();
        onClick();
    };

    return {
        root,
        destroy() {
            root.removeAllListeners();
            root.destroy({ children: true });
        },
    };
}
