import { Container, Graphics, Text } from "pixi.js";
import type { EditorState, EditorTool } from "./state";

const UI_FONT = "'Aoboshi One', sans-serif";
const BTN_H = 32;
const BTN_MIN_W = 72;
const BTN_PAD_X = 20;
const GAP = 8;
const STACK_GAP = 6;
const SEGMENT_H = 32;
const SEGMENT_MIN_W = 64;
const SEGMENT_PAD_X = 18;
const SEGMENT_INSET = 3;
const TRACK_RADIUS = 6;
const BTN_RADIUS = 4;

type VisibleWhen = (state: EditorState) => boolean;

const always: VisibleWhen = () => true;
const whenGround: VisibleWhen = (s) => s.category === "ground";
const whenVariants: VisibleWhen = (s) =>
    s.category === "resources" || s.category === "structures";
const whenRotation: VisibleWhen = (s) =>
    s.category === "resources" ||
    s.category === "structures" ||
    s.category === "decorations";

type ButtonDef = {
    kind: "button";
    id: string;
    label: string;
    getActive?: () => boolean;
    onClick: () => void;
    visibleWhen?: VisibleWhen;
};

type SegmentedDef = {
    kind: "segmented";
    id: string;
    options: {
        id: EditorTool;
        label: string;
        onClick: () => void;
    }[];
    getActive: () => EditorTool;
    visibleWhen?: VisibleWhen;
};

type StackDef = {
    kind: "stack";
    id: string;
    children: ButtonDef[];
    visibleWhen?: VisibleWhen;
};

type ToolbarDef = ButtonDef | SegmentedDef | StackDef;

type LaidOut = {
    root: Container;
    width: number;
    height: number;
    refresh: () => void;
    setVisible: (visible: boolean) => void;
};

function labelWidth(text: Text, min: number, pad: number): number {
    return Math.max(min, text.width + pad);
}

function makeToggleButton(
    label: string,
    onClick: () => void
): {
    root: Container;
    text: Text;
    width: number;
    height: number;
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

    const width = labelWidth(text, BTN_MIN_W, BTN_PAD_X);
    const height = BTN_H;

    const setActive = (active: boolean) => {
        bg.clear();
        bg.roundRect(-width / 2, -height / 2, width, height, BTN_RADIUS).fill(
            active ? 0x5a7a40 : 0x2e3428
        );
        text.alpha = active ? 1 : 0.75;
        root.hitArea = {
            contains: (x: number, y: number) =>
                x >= -width / 2 &&
                x <= width / 2 &&
                y >= -height / 2 &&
                y <= height / 2,
        };
    };
    setActive(false);

    root.onpointerdown = (e: { stopPropagation(): void }) => e.stopPropagation();
    root.onpointerup = (e: { stopPropagation(): void }) => {
        e.stopPropagation();
        onClick();
    };

    return { root, text, width, height, setActive };
}

function buildButton(def: ButtonDef, onAfterClick: () => void): LaidOut {
    const btn = makeToggleButton(def.label, () => {
        def.onClick();
        onAfterClick();
    });
    return {
        root: btn.root,
        width: btn.width,
        height: btn.height,
        refresh: () => btn.setActive(def.getActive?.() ?? false),
        setVisible: (visible) => {
            btn.root.visible = visible;
        },
    };
}

function buildSegmented(def: SegmentedDef, onAfterClick: () => void): LaidOut {
    const root = new Container();
    root.eventMode = "static";
    root.sortableChildren = true;

    const track = new Graphics();
    track.zIndex = 0;
    const thumb = new Graphics();
    thumb.zIndex = 1;
    root.addChild(track);
    root.addChild(thumb);

    type Seg = {
        id: EditorTool;
        label: Text;
        hit: Container;
        width: number;
        onClick: () => void;
    };

    const segs: Seg[] = def.options.map((opt) => {
        const label = new Text({
            text: opt.label,
            style: { fontFamily: UI_FONT, fill: "#ffffff", fontSize: 14 },
        });
        label.anchor.set(0.5);
        const width = labelWidth(label, SEGMENT_MIN_W, SEGMENT_PAD_X);
        const hit = new Container();
        hit.zIndex = 2;
        hit.eventMode = "static";
        hit.cursor = "pointer";
        hit.hitArea = {
            contains: (x: number, y: number) =>
                x >= -width / 2 &&
                x <= width / 2 &&
                y >= -SEGMENT_H / 2 &&
                y <= SEGMENT_H / 2,
        };
        hit.onpointerdown = (e: { stopPropagation(): void }) =>
            e.stopPropagation();
        hit.onpointerup = (e: { stopPropagation(): void }) => {
            e.stopPropagation();
            opt.onClick();
            onAfterClick();
        };
        hit.addChild(label);
        root.addChild(hit);
        return {
            id: opt.id,
            label,
            hit,
            width,
            onClick: opt.onClick,
        };
    });

    const totalW =
        segs.reduce((sum, s) => sum + s.width, 0) + SEGMENT_INSET * 2;
    const totalH = SEGMENT_H + SEGMENT_INSET * 2;

    track
        .roundRect(-totalW / 2, -totalH / 2, totalW, totalH, TRACK_RADIUS)
        .fill(0x1a2218);

    let x = -totalW / 2 + SEGMENT_INSET;
    for (const seg of segs) {
        seg.hit.position.set(x + seg.width / 2, 0);
        x += seg.width;
    }

    const paintThumb = (activeId: EditorTool) => {
        let cx = -totalW / 2 + SEGMENT_INSET;
        let thumbX = 0;
        let thumbW = segs[0]?.width ?? SEGMENT_MIN_W;
        for (const seg of segs) {
            const active = seg.id === activeId;
            seg.label.alpha = active ? 1 : 0.7;
            if (active) {
                thumbX = cx + seg.width / 2;
                thumbW = seg.width;
            }
            cx += seg.width;
        }
        thumb.clear();
        thumb
            .roundRect(
                thumbX - thumbW / 2,
                -SEGMENT_H / 2,
                thumbW,
                SEGMENT_H,
                BTN_RADIUS
            )
            .fill(0x5a7a40);
    };

    paintThumb(def.getActive());

    return {
        root,
        width: totalW,
        height: totalH,
        refresh: () => paintThumb(def.getActive()),
        setVisible: (visible) => {
            root.visible = visible;
        },
    };
}

function itemVisible(def: ToolbarDef, state: EditorState): boolean {
    if (def.kind === "stack") {
        const self = def.visibleWhen?.(state) ?? true;
        if (!self) return false;
        return def.children.some((c) => c.visibleWhen?.(state) ?? true);
    }
    return def.visibleWhen?.(state) ?? true;
}

export type ToolbarHandle = {
    container: Container;
    refresh: () => void;
    containsPoint: (screenX: number, screenY: number) => boolean;
    destroy: () => void;
};

export type ToolbarHandlers = {
    onTool: (tool: EditorTool) => void;
    onToggleDrag: () => void;
    onToggleGroundBrush: () => void;
    onToggleRandomVariant: () => void;
    onToggleRandomRotation: () => void;
    onToggleGrid: () => void;
    onToggleFreeze: () => void;
    onToggleGhostVisible: () => void;
    onKillAll: () => void;
    onSaveMap: () => void;
    onDownloadMap: () => void;
    onWipeMap: () => void;
};

export function createToolbar(
    state: EditorState,
    handlers: ToolbarHandlers
): ToolbarHandle {
    const container = new Container();
    container.eventMode = "static";

    const defs: ToolbarDef[] = [
        {
            kind: "segmented",
            id: "tool",
            getActive: () => state.tool,
            options: [
                {
                    id: "look",
                    label: "Look",
                    onClick: () => handlers.onTool("look"),
                },
                {
                    id: "place",
                    label: "Place",
                    onClick: () => handlers.onTool("place"),
                },
                {
                    id: "delete",
                    label: "Delete",
                    onClick: () => handlers.onTool("delete"),
                },
            ],
            visibleWhen: always,
        },
        {
            kind: "button",
            id: "drag",
            label: "Drag",
            getActive: () => state.drag,
            onClick: () => handlers.onToggleDrag(),
            visibleWhen: always,
        },
        {
            kind: "button",
            id: "ground-1x1",
            label: "1×1",
            getActive: () => state.groundBrush === "tile",
            onClick: () => handlers.onToggleGroundBrush(),
            visibleWhen: whenGround,
        },
        {
            kind: "stack",
            id: "random",
            visibleWhen: (s) => whenVariants(s) || whenRotation(s),
            children: [
                {
                    kind: "button",
                    id: "variant",
                    label: "Rand Var",
                    getActive: () => state.randomVariant,
                    onClick: () => handlers.onToggleRandomVariant(),
                    visibleWhen: whenVariants,
                },
                {
                    kind: "button",
                    id: "rotation",
                    label: "Rand Rot",
                    getActive: () => state.randomRotation,
                    onClick: () => handlers.onToggleRandomRotation(),
                    visibleWhen: whenRotation,
                },
            ],
        },
        {
            kind: "button",
            id: "grid",
            label: "Grid",
            getActive: () => state.showGrid,
            onClick: () => handlers.onToggleGrid(),
            visibleWhen: always,
        },
        {
            kind: "button",
            id: "freeze",
            label: "Freeze",
            getActive: () => state.animalsFrozen,
            onClick: () => handlers.onToggleFreeze(),
            visibleWhen: always,
        },
        {
            kind: "button",
            id: "ghost-vis",
            label: "Ghost",
            getActive: () => state.ghostVisible,
            onClick: () => handlers.onToggleGhostVisible(),
            visibleWhen: always,
        },
        {
            kind: "button",
            id: "kill",
            label: "Kill All",
            onClick: () => handlers.onKillAll(),
            visibleWhen: always,
        },
        {
            kind: "stack",
            id: "map-io",
            visibleWhen: always,
            children: [
                {
                    kind: "button",
                    id: "save-map",
                    label: "Save Map",
                    onClick: () => handlers.onSaveMap(),
                    visibleWhen: always,
                },
                {
                    kind: "button",
                    id: "download-map",
                    label: "Download",
                    onClick: () => handlers.onDownloadMap(),
                    visibleWhen: always,
                },
            ],
        },
        {
            kind: "button",
            id: "wipe-map",
            label: "WIPE",
            onClick: () => handlers.onWipeMap(),
            visibleWhen: always,
        },
    ];

    type Entry = {
        def: ToolbarDef;
        laid: LaidOut;
        /** Per-child laid-outs for stacks (visibility + layout). */
        stackChildren?: { def: ButtonDef; laid: LaidOut }[];
    };

    const entries: Entry[] = defs.map((def) => {
        if (def.kind === "button") {
            const laid = buildButton(def, () => refresh());
            container.addChild(laid.root);
            return { def, laid };
        }
        if (def.kind === "segmented") {
            const laid = buildSegmented(def, () => refresh());
            container.addChild(laid.root);
            return { def, laid };
        }

        // Stack: build children individually so each can hide by category.
        const root = new Container();
        container.addChild(root);
        const stackChildren = def.children.map((child) => {
            const laid = buildButton(child, () => refresh());
            root.addChild(laid.root);
            return { def: child, laid };
        });
        const laid: LaidOut = {
            root,
            width: 0,
            height: 0,
            refresh: () => {
                for (const child of stackChildren) child.laid.refresh();
            },
            setVisible: (visible) => {
                root.visible = visible;
            },
        };
        return { def, laid, stackChildren };
    });

    function refresh() {
        let x = 0;
        let maxH = 0;

        for (const entry of entries) {
            const show = itemVisible(entry.def, state);

            if (entry.def.kind === "stack" && entry.stackChildren) {
                const visibleChildren = entry.stackChildren.filter(
                    (c) => c.def.visibleWhen?.(state) ?? true
                );
                const stackShow = show && visibleChildren.length > 0;
                entry.laid.setVisible(stackShow);

                for (const child of entry.stackChildren) {
                    const childShow =
                        stackShow && (child.def.visibleWhen?.(state) ?? true);
                    child.laid.setVisible(childShow);
                    child.laid.refresh();
                }

                if (!stackShow) continue;

                const width = Math.max(
                    ...visibleChildren.map((c) => c.laid.width),
                    BTN_MIN_W
                );
                const height =
                    visibleChildren.reduce((sum, c) => sum + c.laid.height, 0) +
                    Math.max(0, visibleChildren.length - 1) * STACK_GAP;

                let y = -height / 2;
                for (const child of visibleChildren) {
                    child.laid.root.position.set(0, y + child.laid.height / 2);
                    y += child.laid.height + STACK_GAP;
                }

                entry.laid.width = width;
                entry.laid.height = height;
                entry.laid.root.position.set(x + width / 2, 0);
                x += width + GAP;
                maxH = Math.max(maxH, height);
                continue;
            }

            entry.laid.setVisible(show);
            entry.laid.refresh();
            if (!show) continue;

            entry.laid.root.position.set(x + entry.laid.width / 2, 0);
            x += entry.laid.width + GAP;
            maxH = Math.max(maxH, entry.laid.height);
        }

        const totalW = Math.max(0, x - GAP);
        container.pivot.set(totalW / 2, 0);
        container.position.set(window.innerWidth / 2, 28 + maxH / 2);
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
