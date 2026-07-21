import { Container, Graphics, Text } from "pixi.js";
import { ITEM_BUTTON_SIZE } from "../constants";

const UI_FONT = "'Aoboshi One', sans-serif";
const BTN = ITEM_BUTTON_SIZE;

export type CreativeControl = {
    container: Container;
    setAvailable: (available: boolean) => void;
    setCreativeActive: (active: boolean) => void;
    setInGame: (inGame: boolean) => void;
    /** Place the control at a screen-space center point. */
    setAnchor: (x: number, y: number) => void;
    containsPoint: (screenX: number, screenY: number) => boolean;
    destroy: () => void;
};

/**
 * Square creative toggle — same footprint as freecam / hotbar slots.
 */
export function createCreativeControl(handlers: {
    onToggle: () => void;
}): CreativeControl {
    const container = new Container();
    container.eventMode = "static";
    container.zIndex = 200;
    container.visible = false;

    let available = false;
    let creativeActive = false;
    let inGame = false;
    let anchorX = 0;
    let anchorY = 0;

    const root = new Container();
    root.eventMode = "static";
    root.cursor = "pointer";
    const bg = new Graphics();
    const label = new Text({
        text: "Cre",
        style: { fontFamily: UI_FONT, fill: "#ffffff", fontSize: 12 },
    });
    label.anchor.set(0.5);
    root.addChild(bg);
    root.addChild(label);
    container.addChild(root);

    const paint = () => {
        bg.clear();
        bg.roundRect(-BTN / 2, -BTN / 2, BTN, BTN, 8).fill({
            color: creativeActive ? 0x5a7a40 : 0x2e3428,
            alpha: 0.92,
        });
        label.text = creativeActive ? "Exit" : "Cre";
        label.alpha = creativeActive ? 1 : 0.9;
        root.hitArea = {
            contains: (x: number, y: number) =>
                x >= -BTN / 2 &&
                x <= BTN / 2 &&
                y >= -BTN / 2 &&
                y <= BTN / 2,
        };
    };
    paint();

    root.onpointerdown = (e: { stopPropagation(): void }) => e.stopPropagation();
    root.onpointerup = (e: { stopPropagation(): void }) => {
        e.stopPropagation();
        handlers.onToggle();
    };

    const layout = () => {
        container.position.set(0, 0);
        root.position.set(anchorX, anchorY);
    };

    const syncVisibility = () => {
        container.visible = available && inGame;
        layout();
    };

    return {
        container,
        setAvailable(next) {
            available = next;
            syncVisibility();
        },
        setCreativeActive(active) {
            creativeActive = active;
            paint();
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
            const bounds = root.getBounds();
            return (
                screenX >= bounds.x &&
                screenX <= bounds.x + bounds.width &&
                screenY >= bounds.y &&
                screenY <= bounds.y + bounds.height
            );
        },
        destroy() {
            container.destroy({ children: true });
        },
    };
}
