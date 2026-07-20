import { Container, Graphics, Text } from "pixi.js";
import { UI_FONT } from "@client/assets/text";
import type { TooltipCopy } from "../lang/lang";

const PAD_X = 10;
const PAD_Y = 8;
const GAP = 2;
const MAX_WIDTH = 220;
const OFFSET = 14;
const BG = 0x1a2218;
const BORDER = 0x6a8058;

const titleStyle = {
    fill: 0xf6e5aa,
    fontFamily: UI_FONT,
    fontSize: 14,
    fontWeight: "bold",
    wordWrap: true,
    wordWrapWidth: MAX_WIDTH - PAD_X * 2,
} as const;

const bodyStyle = {
    fill: 0xc5d0b8,
    fontFamily: UI_FONT,
    fontSize: 12,
    wordWrap: true,
    wordWrapWidth: MAX_WIDTH - PAD_X * 2,
} as const;

export type Tooltip = {
    container: Container;
    show: (copy: TooltipCopy, screenX: number, screenY: number) => void;
    move: (screenX: number, screenY: number) => void;
    hide: () => void;
    destroy: () => void;
};

let bound: Tooltip | null = null;

export function getTooltip(): Tooltip | null {
    return bound;
}

export function showTooltip(
    copy: TooltipCopy,
    screenX: number,
    screenY: number
): void {
    bound?.show(copy, screenX, screenY);
}

export function moveTooltip(screenX: number, screenY: number): void {
    bound?.move(screenX, screenY);
}

export function hideTooltip(): void {
    bound?.hide();
}

/** Single screen-space tip; mount on the stage above HUD/admin UI. */
export function createTooltip(): Tooltip {
    const container = new Container();
    container.eventMode = "none";
    container.visible = false;
    container.zIndex = 10_000;

    const background = new Graphics();
    const title = new Text({ text: "", style: titleStyle });
    const body = new Text({ text: "", style: bodyStyle });
    title.position.set(PAD_X, PAD_Y);
    container.addChild(background, title, body);

    function layoutChrome() {
        const textW = Math.max(title.width, body.visible ? body.width : 0);
        const textH = title.height + (body.visible ? GAP + body.height : 0);
        const width = Math.min(MAX_WIDTH, Math.ceil(textW + PAD_X * 2));
        const height = Math.ceil(textH + PAD_Y * 2);
        background.clear();
        background
            .roundRect(0, 0, width, height, 6)
            .fill({ color: BG, alpha: 0.94 })
            .stroke({ color: BORDER, width: 1, alpha: 0.85 });
        return { width, height };
    }

    function place(screenX: number, screenY: number) {
        const { width, height } = layoutChrome();
        const margin = 8;
        let x = screenX + OFFSET;
        let y = screenY - height - OFFSET;
        if (x + width > window.innerWidth - margin) {
            x = screenX - width - OFFSET;
        }
        if (x < margin) x = margin;
        if (y < margin) y = screenY + OFFSET;
        if (y + height > window.innerHeight - margin) {
            y = Math.max(margin, window.innerHeight - margin - height);
        }
        container.position.set(x, y);
    }

    const tip: Tooltip = {
        container,
        show(copy, screenX, screenY) {
            title.text = copy.title;
            if (copy.body) {
                body.text = copy.body;
                body.visible = true;
                body.position.set(PAD_X, PAD_Y + title.height + GAP);
            } else {
                body.text = "";
                body.visible = false;
            }
            container.visible = true;
            place(screenX, screenY);
        },
        move(screenX, screenY) {
            if (!container.visible) return;
            place(screenX, screenY);
        },
        hide() {
            container.visible = false;
            title.text = "";
            body.text = "";
        },
        destroy() {
            if (bound === tip) bound = null;
            container.destroy({ children: true });
        },
    };

    bound = tip;
    return tip;
}
