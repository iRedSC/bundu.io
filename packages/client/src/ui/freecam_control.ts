import { Container, Graphics, Text } from "pixi.js";
import { SpriteFactory } from "../assets/sprite_factory";
import { ITEM_BUTTON_SIZE } from "../constants";

const UI_FONT = "'Aoboshi One', sans-serif";
const DRAG_THRESHOLD = 8;
const PLAYER_ICON = "bundu/entity/player/player.png";
const BTN = ITEM_BUTTON_SIZE;
const GAP = 8;

export type FreecamControl = {
    container: Container;
    setAvailable: (available: boolean) => void;
    setFreecamActive: (active: boolean) => void;
    setInGame: (inGame: boolean) => void;
    /** Place the control at a screen-space center point. */
    setAnchor: (x: number, y: number) => void;
    containsPoint: (screenX: number, screenY: number) => boolean;
    isDragging: () => boolean;
    destroy: () => void;
};

/**
 * Mode control for freecam — square button matching hotbar slot size.
 * Idle: enter. Freecam: player icon — click exits, drag-drop relocates.
 */
export function createFreecamControl(handlers: {
    onEnter: () => void;
    onExit: () => void;
    onExitAt: (screenX: number, screenY: number) => void;
    isBlockedDrop: (screenX: number, screenY: number) => boolean;
}): FreecamControl {
    const container = new Container();
    container.eventMode = "static";
    container.zIndex = 200;
    container.visible = false;

    let available = false;
    let freecamActive = false;
    let inGame = false;
    let anchorX = 0;
    let anchorY = 0;

    const enterBtn = makeSquareButton("Cam", () => {
        if (!freecamActive) handlers.onEnter();
    });
    container.addChild(enterBtn.root);

    const iconRoot = new Container();
    iconRoot.eventMode = "static";
    iconRoot.cursor = "grab";
    iconRoot.visible = false;
    const iconBg = new Graphics();
    iconBg.roundRect(-BTN / 2, -BTN / 2, BTN, BTN, 8).fill({
        color: 0x2e3428,
        alpha: 0.92,
    });
    const icon = SpriteFactory.build(PLAYER_ICON);
    icon.width = BTN * 0.78;
    icon.height = BTN * 0.78;
    icon.anchor.set(0.5);
    iconRoot.addChild(iconBg);
    iconRoot.addChild(icon);
    iconRoot.hitArea = {
        contains: (x: number, y: number) =>
            x >= -BTN / 2 && x <= BTN / 2 && y >= -BTN / 2 && y <= BTN / 2,
    };
    container.addChild(iconRoot);

    const ghost = SpriteFactory.build(PLAYER_ICON);
    ghost.width = BTN * 0.78;
    ghost.height = BTN * 0.78;
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
        enterBtn.root.position.set(anchorX, anchorY);
        iconRoot.position.set(anchorX, anchorY);
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
        setAnchor(x, y) {
            anchorX = x;
            anchorY = y;
            layout();
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
            cancelDrag();
            enterBtn.destroy();
            icon.destroy();
            ghost.destroy();
            container.destroy({ children: true });
        },
    };
}

function makeSquareButton(labelText: string, onClick: () => void): {
    root: Container;
    destroy: () => void;
} {
    const root = new Container();
    root.eventMode = "static";
    root.cursor = "pointer";

    const bg = new Graphics();
    bg.roundRect(-BTN / 2, -BTN / 2, BTN, BTN, 8).fill({
        color: 0x2e3428,
        alpha: 0.92,
    });
    const text = new Text({
        text: labelText,
        style: { fontFamily: UI_FONT, fill: "#ffffff", fontSize: 12 },
    });
    text.anchor.set(0.5);
    root.addChild(bg);
    root.addChild(text);
    root.hitArea = {
        contains: (x: number, y: number) =>
            x >= -BTN / 2 && x <= BTN / 2 && y >= -BTN / 2 && y <= BTN / 2,
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

export const MODE_CONTROL_SIZE = BTN;
export const MODE_CONTROL_GAP = GAP;
