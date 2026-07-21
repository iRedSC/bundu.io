import { Container, Graphics, Text } from "pixi.js";

const UI_FONT = "'Aoboshi One', sans-serif";
const MARGIN = 20;
const BTN_W = 88;
const BTN_H = 36;

export type CreativeControl = {
    container: Container;
    setAvailable: (available: boolean) => void;
    setCreativeActive: (active: boolean) => void;
    setInGame: (inGame: boolean) => void;
    /** Keep clear of freecam control (stacked above it). */
    setStackOffset: (offsetY: number) => void;
    containsPoint: (screenX: number, screenY: number) => boolean;
    destroy: () => void;
};

/**
 * Bottom-right creative toggle for op-4 players (above freecam control).
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
    let stackOffset = 52;

    const root = new Container();
    root.eventMode = "static";
    root.cursor = "pointer";
    const bg = new Graphics();
    const label = new Text({
        text: "Creative",
        style: { fontFamily: UI_FONT, fill: "#ffffff", fontSize: 13 },
    });
    label.anchor.set(0.5);
    root.addChild(bg);
    root.addChild(label);
    container.addChild(root);

    const paint = () => {
        bg.clear();
        bg.roundRect(-BTN_W / 2, -BTN_H / 2, BTN_W, BTN_H, 8).fill(
            creativeActive ? 0x5a7a40 : 0x2e3428
        );
        label.text = creativeActive ? "Exit Crea" : "Creative";
        label.alpha = creativeActive ? 1 : 0.9;
        root.hitArea = {
            contains: (x: number, y: number) =>
                x >= -BTN_W / 2 &&
                x <= BTN_W / 2 &&
                y >= -BTN_H / 2 &&
                y <= BTN_H / 2,
        };
    };
    paint();

    root.onpointerdown = (e: { stopPropagation(): void }) => e.stopPropagation();
    root.onpointerup = (e: { stopPropagation(): void }) => {
        e.stopPropagation();
        handlers.onToggle();
    };

    const layout = () => {
        container.position.set(
            window.innerWidth - MARGIN - BTN_W / 2,
            window.innerHeight - MARGIN - BTN_H / 2 - stackOffset
        );
    };

    const syncVisibility = () => {
        container.visible = available && inGame;
        layout();
    };

    const onResize = () => layout();
    window.addEventListener("resize", onResize);
    layout();

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
        setStackOffset(offsetY) {
            stackOffset = offsetY;
            layout();
        },
        containsPoint(screenX, screenY) {
            if (!container.visible) return false;
            const bounds = container.getBounds();
            return (
                screenX >= bounds.x &&
                screenX <= bounds.x + bounds.width &&
                screenY >= bounds.y &&
                screenY <= bounds.y + bounds.height
            );
        },
        destroy() {
            window.removeEventListener("resize", onResize);
            container.destroy({ children: true });
        },
    };
}
