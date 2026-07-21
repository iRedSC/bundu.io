import { Container, Graphics, Text } from "pixi.js";
import { creativeCategoryFor } from "@bundu/shared/creative";
import { ClientPacket } from "@bundu/shared/packet_definitions";
import { ITEM_BUTTON_SIZE } from "../constants";
import {
    clientItemMeta,
    clientRegistries,
} from "../configs/registries";
import type { SendPacket } from "../input/controller";
import {
    ItemButton,
    tickItemButton,
    type ItemButtonColors,
} from "../ui/item_button";
import {
    hideRegistryTooltip,
    moveRegistryTooltip,
    showRegistryTooltip,
} from "../ui/registry_tooltip";
import type { CreativeCategory, CreativeState } from "./state";

const UI_FONT = "'Aoboshi One', sans-serif";
const SLOT_COLORS: ItemButtonColors = {
    empty: 0x1a2218,
    default: 0x3a4a32,
    hover: 0x6a8058,
    down: 0x1a2218,
    rightDown: 0x6a8058,
};

const TAB_LABELS: { id: CreativeCategory; label: string }[] = [
    { id: "materials", label: "Materials" },
    { id: "equipment", label: "Equipment" },
    { id: "resources", label: "Resources" },
    { id: "buildings", label: "Buildings" },
];

const SLOT_GAP = 8;
const TAB_HEIGHT = 28;
const TAB_GAP = 4;
const EDGE_PAD = 10;
const SLOT_STRIDE = ITEM_BUTTON_SIZE + SLOT_GAP;
const PANEL_COLS = 4;
const PAGER_HEIGHT = 28;
const SECTION_GAP = 12;
const GRID_WIDTH = PANEL_COLS * SLOT_STRIDE - SLOT_GAP;

function fuzzyRank(value: string, query: string): number | undefined {
    if (!query) return 0;
    const v = value.toLowerCase();
    const bare = v.includes(":") ? v.slice(v.lastIndexOf(":") + 1) : v;
    if (bare.startsWith(query) || v.startsWith(query)) {
        return 3000 - bare.length;
    }
    const bareIdx = bare.indexOf(query);
    const fullIdx = bareIdx >= 0 ? bareIdx : v.indexOf(query);
    if (fullIdx >= 0) {
        const at = bareIdx >= 0 ? bareIdx : fullIdx;
        const hay = bareIdx >= 0 ? bare : v;
        const boundary =
            at === 0 || hay[at - 1] === "_" || hay[at - 1] === ":";
        return (boundary ? 2000 : 1000) - at;
    }
    let qi = 0;
    for (let i = 0; i < bare.length && qi < query.length; i++) {
        if (bare[i] === query[qi]) qi++;
    }
    if (qi === query.length) return 100 - bare.length;
    return undefined;
}

function fuzzyFilter(
    items: readonly { id: number; location: string }[],
    query: string
): { id: number; location: string }[] {
    const lower = query.trim().toLowerCase();
    if (!lower) return [...items];
    const hits: { item: { id: number; location: string }; rank: number }[] =
        [];
    for (const item of items) {
        const rank = fuzzyRank(item.location, lower);
        if (rank !== undefined) hits.push({ item, rank });
    }
    hits.sort(
        (a, b) =>
            b.rank - a.rank ||
            a.item.location.localeCompare(b.item.location)
    );
    return hits.map((h) => h.item);
}

function listCategoryItems(
    category: CreativeCategory
): { id: number; location: string }[] {
    const registries = clientRegistries();
    const resourceLocations = new Set(
        [...registries.resource.entries()].map(([loc]) => loc)
    );
    const out: { id: number; location: string }[] = [];
    for (const [location, id] of registries.item.entries()) {
        const meta = clientItemMeta(id);
        if (creativeCategoryFor(location, meta, resourceLocations) !== category) {
            continue;
        }
        out.push({ id, location });
    }
    out.sort((a, b) => a.location.localeCompare(b.location));
    return out;
}

function makeTab(
    label: string,
    onClick: () => void
): {
    root: Container;
    width: number;
    setActive: (active: boolean) => void;
} {
    const root = new Container();
    root.eventMode = "static";
    root.cursor = "pointer";
    const bg = new Graphics();
    const text = new Text({
        text: label,
        style: { fontFamily: UI_FONT, fill: "#ffffff", fontSize: 12 },
    });
    text.anchor.set(0.5);
    const width = Math.max(72, text.width + 16);
    root.addChild(bg);
    root.addChild(text);
    const setActive = (active: boolean) => {
        bg.clear();
        bg.roundRect(-width / 2, -TAB_HEIGHT / 2, width, TAB_HEIGHT, 4).fill(
            active ? 0x5a7a40 : 0x2a3224
        );
        text.alpha = active ? 1 : 0.75;
    };
    setActive(false);
    root.onpointerdown = (e: { stopPropagation(): void }) => e.stopPropagation();
    root.onpointerup = (e: { stopPropagation(): void }) => {
        e.stopPropagation();
        onClick();
    };
    return { root, width, setActive };
}

function makePagerBtn(
    text: string,
    onClick: () => void
): {
    root: Container;
    width: number;
    setEnabled: (enabled: boolean) => void;
} {
    const root = new Container();
    root.eventMode = "static";
    root.cursor = "pointer";
    const bg = new Graphics();
    const label = new Text({
        text,
        style: { fontFamily: UI_FONT, fill: "#ffffff", fontSize: 14 },
    });
    label.anchor.set(0.5);
    const w = 28;
    bg.roundRect(-w / 2, -PAGER_HEIGHT / 2, w, PAGER_HEIGHT, 4).fill(0x2a3224);
    root.addChild(bg);
    root.addChild(label);
    root.onpointerdown = (e: { stopPropagation(): void }) => e.stopPropagation();
    root.onpointerup = (e: { stopPropagation(): void }) => {
        e.stopPropagation();
        onClick();
    };
    return {
        root,
        width: w,
        setEnabled: (enabled) => {
            root.alpha = enabled ? 1 : 0.35;
            root.eventMode = enabled ? "static" : "none";
        },
    };
}

function createSearchInput(onChange: (query: string) => void): HTMLInputElement {
    const input = document.createElement("input");
    input.type = "search";
    input.placeholder = "Search…";
    input.autocomplete = "off";
    input.spellcheck = false;
    Object.assign(input.style, {
        position: "fixed",
        zIndex: "30",
        pointerEvents: "auto",
        border: "1px solid #4a5a40",
        borderRadius: "4px",
        background: "#1a2218",
        color: "#ffffff",
        fontFamily: UI_FONT,
        fontSize: "13px",
        padding: "2px 8px",
        outline: "none",
        boxSizing: "border-box",
        display: "none",
    } as const);
    input.addEventListener("input", () => onChange(input.value));
    input.addEventListener("pointerdown", (e) => e.stopPropagation());
    input.addEventListener("keydown", (e) => e.stopPropagation());
    document.body.appendChild(input);
    return input;
}

export type CreativePaletteHandle = {
    container: Container;
    rebuild: () => void;
    setVisible: (visible: boolean) => void;
    tick: (now?: number) => void;
    containsPoint: (screenX: number, screenY: number) => boolean;
    destroy: () => void;
};

export function createCreativePalette(
    state: CreativeState,
    sendPacket: SendPacket
): CreativePaletteHandle {
    const container = new Container();
    container.eventMode = "static";

    const categoryRow = new Container();
    categoryRow.eventMode = "static";
    container.addChild(categoryRow);

    const grid = new Container();
    grid.eventMode = "static";
    container.addChild(grid);

    const pagerRoot = new Container();
    pagerRoot.eventMode = "static";
    container.addChild(pagerRoot);

    const searchInput = createSearchInput((q) => {
        searchQuery = q;
        page = 0;
        rebuildGrid();
    });

    let searchQuery = "";
    let page = 0;
    let pageCount = 1;
    let slots: ItemButton[] = [];
    let filtered: { id: number; location: string }[] = [];
    let panelVisible = false;

    const prevBtn = makePagerBtn("←", () => {
        if (page <= 0) return;
        page -= 1;
        rebuildGrid();
    });
    const nextBtn = makePagerBtn("→", () => {
        if (page >= pageCount - 1) return;
        page += 1;
        rebuildGrid();
    });
    const pageLabel = new Text({
        text: "1/1",
        style: { fontFamily: UI_FONT, fill: "#ffffff", fontSize: 13 },
    });
    pageLabel.anchor.set(0.5);
    pagerRoot.addChild(prevBtn.root);
    pagerRoot.addChild(pageLabel);
    pagerRoot.addChild(nextBtn.root);

    const tabs = TAB_LABELS.map(({ id, label }) => {
        const tab = makeTab(label, () => {
            if (state.category === id) return;
            state.category = id;
            page = 0;
            rebuild();
        });
        categoryRow.addChild(tab.root);
        return { id, tab };
    });

    const give = (itemId: number, shift: boolean) => {
        if (itemId < 0) return;
        sendPacket(ClientPacket.CreativeGive, {
            itemId,
            count: shift ? 10 : 1,
        });
    };

    const layoutChrome = () => {
        let x = 0;
        for (const { id, tab } of tabs) {
            tab.root.position.set(x + tab.width / 2, TAB_HEIGHT / 2);
            tab.setActive(id === state.category);
            x += tab.width + TAB_GAP;
        }
        categoryRow.position.set(EDGE_PAD, EDGE_PAD);

        const searchY = EDGE_PAD + TAB_HEIGHT + SECTION_GAP;
        searchInput.style.left = `${EDGE_PAD}px`;
        searchInput.style.top = `${searchY}px`;
        searchInput.style.width = `${GRID_WIDTH}px`;
        searchInput.style.height = `${TAB_HEIGHT}px`;
        searchInput.style.display = panelVisible ? "block" : "none";

        const gridY = searchY + TAB_HEIGHT + SECTION_GAP;
        grid.position.set(EDGE_PAD + ITEM_BUTTON_SIZE / 2, gridY + ITEM_BUTTON_SIZE / 2);

        const rows = Math.max(1, Math.ceil(slots.length / PANEL_COLS));
        const gridH = rows * SLOT_STRIDE - SLOT_GAP;
        pagerRoot.position.set(EDGE_PAD, gridY + gridH + SECTION_GAP + PAGER_HEIGHT / 2);
        prevBtn.root.position.set(prevBtn.width / 2, 0);
        pageLabel.position.set(prevBtn.width + 6 + pageLabel.width / 2, 0);
        nextBtn.root.position.set(
            prevBtn.width + 6 + pageLabel.width + 6 + nextBtn.width / 2,
            0
        );
    };

    const rebuildGrid = () => {
        for (const slot of slots) slot.destroy();
        slots = [];
        grid.removeChildren();

        filtered = fuzzyFilter(listCategoryItems(state.category), searchQuery);
        const perPage = PANEL_COLS * 6;
        pageCount = Math.max(1, Math.ceil(filtered.length / perPage));
        page = Math.min(page, pageCount - 1);
        const slice = filtered.slice(page * perPage, (page + 1) * perPage);

        slice.forEach((entry, i) => {
            const slot = new ItemButton();
            slot.item = entry.id;
            slot.button.cursor = "pointer";
            slot.leftclick = (_id, shift) => give(entry.id, shift);
            slot.onHover = (hovering, ev) => {
                if (!hovering || !ev) {
                    hideRegistryTooltip();
                    return;
                }
                showRegistryTooltip(
                    "item",
                    entry.location,
                    ev.global.x,
                    ev.global.y
                );
            };
            slot.onHoverMove = (ev) =>
                moveRegistryTooltip(ev.global.x, ev.global.y);
            const col = i % PANEL_COLS;
            const row = Math.floor(i / PANEL_COLS);
            slot.button.position.set(col * SLOT_STRIDE, row * SLOT_STRIDE);
            grid.addChild(slot.button);
            slots.push(slot);
        });

        pageLabel.text = `${page + 1}/${pageCount}`;
        prevBtn.setEnabled(page > 0);
        nextBtn.setEnabled(page < pageCount - 1);
        layoutChrome();
    };

    const rebuild = () => {
        rebuildGrid();
    };

    rebuild();

    return {
        container,
        rebuild,
        setVisible(visible) {
            panelVisible = visible;
            container.visible = visible;
            searchInput.style.display = visible ? "block" : "none";
            if (!visible) hideRegistryTooltip();
            if (visible) layoutChrome();
        },
        tick(now) {
            if (!panelVisible) return;
            for (const slot of slots) {
                tickItemButton(slot, SLOT_COLORS, 0, 1, now);
            }
        },
        containsPoint(screenX, screenY) {
            if (!panelVisible) return false;
            const bounds = container.getBounds();
            const searchBox =
                screenX >= EDGE_PAD &&
                screenX <= EDGE_PAD + GRID_WIDTH &&
                screenY >= EDGE_PAD + TAB_HEIGHT + SECTION_GAP &&
                screenY <= EDGE_PAD + TAB_HEIGHT + SECTION_GAP + TAB_HEIGHT;
            return (
                searchBox ||
                (screenX >= bounds.x - 8 &&
                    screenX <= bounds.x + Math.max(bounds.width, GRID_WIDTH) + 8 &&
                    screenY >= bounds.y - 8 &&
                    screenY <= bounds.y + bounds.height + 8)
            );
        },
        destroy() {
            hideRegistryTooltip();
            searchInput.remove();
            for (const slot of slots) slot.destroy();
            container.destroy({ children: true });
        },
    };
}
