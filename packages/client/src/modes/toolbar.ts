import { Container, Graphics, Text } from "pixi.js";

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

export type VisibleWhen<S> = (state: S) => boolean;

export type ModeButtonDef<S> = {
    kind: "button";
    id: string;
    label: string;
    /** When set, label text is refreshed each layout pass. */
    getLabel?: () => string;
    getActive?: () => boolean;
    onClick: () => void;
    visibleWhen?: VisibleWhen<S>;
};

export type ModeSegmentedDef<S, T extends string = string> = {
    kind: "segmented";
    id: string;
    options: {
        id: T;
        label: string;
        onClick: () => void;
    }[];
    getActive: () => T;
    visibleWhen?: VisibleWhen<S>;
};

export type ModeStackDef<S> = {
    kind: "stack";
    id: string;
    children: ModeButtonDef<S>[];
    visibleWhen?: VisibleWhen<S>;
};

export type ModeToolbarDef<S, T extends string = string> =
    | ModeButtonDef<S>
    | ModeSegmentedDef<S, T>
    | ModeStackDef<S>;

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
    height: number;
    getWidth: () => number;
    setActive: (active: boolean) => void;
    setLabel: (label: string) => void;
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

    let width = labelWidth(text, BTN_MIN_W, BTN_PAD_X);
    const height = BTN_H;
    let active = false;

    const layoutHit = () => {
        root.hitArea = {
            contains: (x: number, y: number) =>
                x >= -width / 2 &&
                x <= width / 2 &&
                y >= -height / 2 &&
                y <= height / 2,
        };
    };

    const paint = () => {
        bg.clear();
        bg.roundRect(-width / 2, -height / 2, width, height, BTN_RADIUS).fill(
            active ? 0x5a7a40 : 0x2e3428
        );
        text.alpha = active ? 1 : 0.75;
        layoutHit();
    };

    const setActive = (next: boolean) => {
        active = next;
        paint();
    };

    const setLabel = (next: string) => {
        if (text.text === next) return;
        text.text = next;
        width = labelWidth(text, BTN_MIN_W, BTN_PAD_X);
        paint();
    };

    setActive(false);

    root.onpointerdown = (e: { stopPropagation(): void }) => e.stopPropagation();
    root.onpointerup = (e: { stopPropagation(): void }) => {
        e.stopPropagation();
        onClick();
    };

    return {
        root,
        text,
        height,
        getWidth: () => width,
        setActive,
        setLabel,
    };
}

function buildButton<S>(
    def: ModeButtonDef<S>,
    onAfterClick: () => void
): LaidOut {
    const btn = makeToggleButton(def.label, () => {
        def.onClick();
        onAfterClick();
    });
    const laid: LaidOut = {
        root: btn.root,
        width: btn.getWidth(),
        height: btn.height,
        refresh: () => {
            if (def.getLabel) btn.setLabel(def.getLabel());
            btn.setActive(def.getActive?.() ?? false);
            laid.width = btn.getWidth();
        },
        setVisible: (visible) => {
            btn.root.visible = visible;
        },
    };
    return laid;
}

function buildSegmented<S, T extends string>(
    def: ModeSegmentedDef<S, T>,
    onAfterClick: () => void
): LaidOut {
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
        id: T;
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

    const paintThumb = (activeId: T) => {
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

function itemVisible<S>(def: ModeToolbarDef<S>, state: S): boolean {
    if (def.kind === "stack") {
        const self = def.visibleWhen?.(state) ?? true;
        if (!self) return false;
        return def.children.some((c) => c.visibleWhen?.(state) ?? true);
    }
    return def.visibleWhen?.(state) ?? true;
}

export type ModeToolbarHandle = {
    container: Container;
    refresh: () => void;
    containsPoint: (screenX: number, screenY: number) => boolean;
    destroy: () => void;
};

/**
 * Declarative top-of-screen mode toolbar (shared by freecam admin + creative).
 * Schema: buttons, segmented tracks, and vertical stacks with `visibleWhen`.
 */
export function createModeToolbar<S, T extends string = string>(
    state: S,
    defs: ModeToolbarDef<S, T>[]
): ModeToolbarHandle {
    const container = new Container();
    container.eventMode = "static";

    type Entry = {
        def: ModeToolbarDef<S, T>;
        laid: LaidOut;
        stackChildren?: { def: ModeButtonDef<S>; laid: LaidOut }[];
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
