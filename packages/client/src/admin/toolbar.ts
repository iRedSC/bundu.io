import { Container, Graphics, Text } from "pixi.js";
import type { EditorState, EditorTool } from "./state";

const UI_FONT = "'Aoboshi One', sans-serif";

type ToolButton = {
    id: string;
    label: string;
    getActive?: () => boolean;
    onClick: () => void;
};

export type ToolbarHandle = {
    container: Container;
    refresh: () => void;
    containsPoint: (screenX: number, screenY: number) => boolean;
    destroy: () => void;
};

function makeButton(
    label: string,
    onClick: () => void
): {
    root: Container;
    bg: Graphics;
    text: Text;
    setActive: (active: boolean) => void;
} {
    const root = new Container();
    root.eventMode = "static";
    root.cursor = "pointer";
    const bg = new Graphics();
    const text = new Text({
        text: label,
        style: { fontFamily: UI_FONT, fill: "#ffffff", fontSize: 14 },
    });
    text.anchor.set(0.5);
    root.addChild(bg);
    root.addChild(text);

    const setActive = (active: boolean) => {
        const w = Math.max(72, text.width + 20);
        const h = 32;
        bg.clear();
        bg.roundRect(-w / 2, -h / 2, w, h, 4).fill(active ? 0x5a7a40 : 0x2e3428);
        text.alpha = active ? 1 : 0.75;
        root.hitArea = {
            contains: (x: number, y: number) =>
                x >= -w / 2 && x <= w / 2 && y >= -h / 2 && y <= h / 2,
        };
    };
    setActive(false);

    root.onpointerdown = (e: { stopPropagation(): void }) => e.stopPropagation();
    root.onpointerup = (e: { stopPropagation(): void }) => {
        e.stopPropagation();
        onClick();
    };

    return { root, bg, text, setActive };
}

export function createToolbar(
    state: EditorState,
    handlers: {
        onTool: (tool: EditorTool) => void;
        onToggleDrag: () => void;
        onToggleGroundBrush: () => void;
        onToggleRandomVariant: () => void;
        onToggleRandomRotation: () => void;
        onToggleGrid: () => void;
        onToggleFreeze: () => void;
        onKillAll: () => void;
        onSaveMap: () => void;
        onDownloadMap: () => void;
        onWipeMap: () => void;
    }
): ToolbarHandle {
    const container = new Container();
    container.eventMode = "static";

    const defs: ToolButton[] = [
        {
            id: "place",
            label: "Place",
            getActive: () => state.tool === "place",
            onClick: () => handlers.onTool("place"),
        },
        {
            id: "delete",
            label: "Delete",
            getActive: () => state.tool === "delete",
            onClick: () => handlers.onTool("delete"),
        },
        {
            id: "drag",
            label: "Drag",
            getActive: () => state.drag,
            onClick: () => handlers.onToggleDrag(),
        },
        {
            id: "ground-1x1",
            label: "1×1",
            getActive: () => state.groundBrush === "tile",
            onClick: () => handlers.onToggleGroundBrush(),
        },
        {
            id: "variant",
            label: "Rand Var",
            getActive: () => state.randomVariant,
            onClick: () => handlers.onToggleRandomVariant(),
        },
        {
            id: "rotation",
            label: "Rand Rot",
            getActive: () => state.randomRotation,
            onClick: () => handlers.onToggleRandomRotation(),
        },
        {
            id: "grid",
            label: "Grid",
            getActive: () => state.showGrid,
            onClick: () => handlers.onToggleGrid(),
        },
        {
            id: "freeze",
            label: "Freeze",
            getActive: () => state.animalsFrozen,
            onClick: () => handlers.onToggleFreeze(),
        },
        {
            id: "kill",
            label: "Kill All",
            onClick: () => handlers.onKillAll(),
        },
        {
            id: "save-map",
            label: "Save Map",
            onClick: () => handlers.onSaveMap(),
        },
        {
            id: "download-map",
            label: "Download",
            onClick: () => handlers.onDownloadMap(),
        },
        {
            id: "wipe-map",
            label: "WIPE",
            onClick: () => handlers.onWipeMap(),
        },
    ];

    const buttons = defs.map((def) => {
        const btn = makeButton(def.label, () => {
            def.onClick();
            refresh();
        });
        container.addChild(btn.root);
        return { def, btn };
    });

    function refresh() {
        let x = 0;
        const gap = 8;
        for (const { def, btn } of buttons) {
            const active = def.getActive?.() ?? false;
            btn.setActive(active);
            const w = Math.max(72, btn.text.width + 20);
            btn.root.position.set(x + w / 2, 0);
            x += w + gap;
        }
        container.pivot.set(x / 2, 0);
        container.position.set(window.innerWidth / 2, 28);
    }

    function onResize() {
        refresh();
    }
    window.addEventListener("resize", onResize);
    refresh();

    return {
        container,
        refresh,
        containsPoint(screenX: number, screenY: number) {
            const bounds = container.getBounds();
            return (
                screenX >= bounds.x - 8 &&
                screenX <= bounds.x + bounds.width + 8 &&
                screenY >= bounds.y - 8 &&
                screenY <= bounds.y + bounds.height + 8
            );
        },
        destroy() {
            window.removeEventListener("resize", onResize);
            container.destroy({ children: true });
        },
    };
}
