import { Container, Graphics, Text } from "pixi.js";
import { creativeCategoryFor } from "@bundu/shared/creative";
import type { TagLocation } from "@bundu/shared/registry";
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
    { id: "food", label: "Food" },
];

const SLOT_GAP = 8;
const TAB_HEIGHT = 28;
const TAB_GAP = 4;
const EDGE_PAD = 10;
const SLOT_STRIDE = ITEM_BUTTON_SIZE + SLOT_GAP;
const PANEL_COLS = 4;
/** Fixed grid footprint so the pager/search row does not jump on short pages. */
const PANEL_ROWS = 6;
const PAGER_HEIGHT = 28;
const SECTION_GAP = 12;
const GRID_WIDTH = PANEL_COLS * SLOT_STRIDE - SLOT_GAP;
const GRID_HEIGHT = PANEL_ROWS * SLOT_STRIDE - SLOT_GAP;
const PAGE_SIZE = PANEL_COLS * PANEL_ROWS;
const DRAG_THRESHOLD = 8;

function tagLabel(tag: TagLocation): string {
    const path = tag.slice(tag.indexOf(":") + 1);
    return path.replaceAll("_", " ");
}

function listItemTags(): { tag: TagLocation; label: string }[] {
    const tags: { tag: TagLocation; label: string }[] = [];
    for (const [tag] of clientRegistries().item.categoryTagEntries()) {
        tags.push({ tag, label: tagLabel(tag) });
    }
    tags.sort((a, b) => a.label.localeCompare(b.label));
    return tags;
}

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
    category: CreativeCategory | "all",
    tagFilter: string | null
): { id: number; location: string }[] {
    const registries = clientRegistries();
    const resourceLocations = new Set(
        [...registries.resource.entries()].map(([loc]) => loc)
    );
    let tagIds: Set<number> | null = null;
    if (tagFilter !== null) {
        try {
            tagIds = new Set(
                registries.item.resolveSet(
                    [tagFilter],
                    undefined,
                    "creative.tag"
                )
            );
        } catch {
            tagIds = new Set();
        }
    }

    const out: { id: number; location: string }[] = [];
    for (const [location, id] of registries.item.entries()) {
        if (tagIds && !tagIds.has(id)) continue;
        const meta = clientItemMeta(id);
        const cat = creativeCategoryFor(location, meta, resourceLocations);
        if (category !== "all" && cat !== category) continue;
        out.push({ id, location });
    }
    out.sort((a, b) => a.location.localeCompare(b.location));
    return out;
}

type TabChip = {
    root: Container;
    label: Text;
    setActive: (active: boolean) => void;
};

function makeTabChip(
    text: string,
    onClick: () => void,
    activeFill: number,
    idleFill: number
): TabChip {
    const root = new Container();
    root.eventMode = "static";
    root.cursor = "pointer";
    const bg = new Graphics();
    const label = new Text({
        text,
        style: { fontFamily: UI_FONT, fill: "#ffffff", fontSize: 14 },
    });
    label.anchor.set(0.5);
    root.addChild(bg);
    root.addChild(label);

    const setActive = (active: boolean) => {
        const w = Math.max(56, label.width + 16);
        bg.clear();
        bg.roundRect(0, 0, w, TAB_HEIGHT, 4).fill(active ? activeFill : idleFill);
        label.position.set(w / 2, TAB_HEIGHT / 2);
        label.alpha = active ? 1 : 0.7;
    };
    setActive(false);

    root.onpointerdown = (e: { stopPropagation(): void }) => {
        e.stopPropagation();
        onClick();
    };

    return { root, label, setActive };
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

export type CreativePaletteHooks = {
    /** True when the inventory cursor currently holds a stack. */
    hasCursor: () => boolean;
    /** Optimistic cursor pick (id + count) so drag-release can place immediately. */
    onPickedToCursor: (itemId: number, count: number) => void;
};

export function createCreativePalette(
    state: CreativeState,
    sendPacket: SendPacket,
    hooks: CreativePaletteHooks
): CreativePaletteHandle {
    const container = new Container();
    container.eventMode = "static";

    const categoryRow = new Container();
    categoryRow.eventMode = "static";
    container.addChild(categoryRow);

    const tagRow = new Container();
    tagRow.eventMode = "static";
    container.addChild(tagRow);

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
    let tagChips: { tag: string | null; chip: TabChip }[] = [];

    // Drag-from-palette state (left button).
    let pressItemId: number | null = null;
    let pressShift = false;
    let pressX = 0;
    let pressY = 0;
    let pressDragging = false;
    let suppressNextGive = false;

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

    const categoryTabs: { id: CreativeCategory; chip: TabChip }[] = [];
    for (const tab of TAB_LABELS) {
        const chip = makeTabChip(
            tab.label,
            () => {
                if (state.category === tab.id) return;
                state.category = tab.id;
                state.tagFilter = null;
                page = 0;
                searchQuery = "";
                searchInput.value = "";
                rebuild();
            },
            0x4a6238,
            0x2a3224
        );
        categoryRow.addChild(chip.root);
        categoryTabs.push({ id: tab.id, chip });
    }

    function layoutChipRow(
        chips: { chip: TabChip; active: boolean }[]
    ): number {
        let x = 0;
        for (const { chip, active } of chips) {
            chip.setActive(active);
            const w = Math.max(56, chip.label.width + 16);
            chip.root.position.set(x, 0);
            x += w + TAB_GAP;
        }
        return x;
    }

    function rebuildTagRow() {
        for (const { chip } of tagChips) chip.root.destroy({ children: true });
        tagChips = [];
        tagRow.removeChildren();

        const tags = listItemTags();
        const options: { tag: string | null; label: string }[] = [
            { tag: null, label: "All" },
            ...tags.map((t) => ({ tag: t.tag as string, label: t.label })),
        ];

        if (
            state.tagFilter !== null &&
            !tags.some((t) => t.tag === state.tagFilter)
        ) {
            state.tagFilter = null;
        }

        for (const option of options) {
            const chip = makeTabChip(
                option.label,
                () => {
                    state.tagFilter = option.tag;
                    page = 0;
                    rebuild();
                },
                0x3a5a6a,
                0x243038
            );
            tagRow.addChild(chip.root);
            tagChips.push({ tag: option.tag, chip });
        }
    }

    function headerHeight(): number {
        return TAB_HEIGHT * 2 + TAB_GAP;
    }

    const give = (itemId: number, shift: boolean) => {
        if (itemId < 0) return;
        sendPacket(ClientPacket.CreativeGive, {
            itemId,
            count: shift ? 10 : 1,
        });
    };

    const giveToCursor = (itemId: number, shift: boolean) => {
        if (itemId < 0) return;
        const count = shift ? 10 : 1;
        sendPacket(ClientPacket.CreativeGiveToCursor, {
            itemId,
            count,
        });
        hooks.onPickedToCursor(itemId, count);
    };

    const voidCursor = () => {
        sendPacket(ClientPacket.CreativeVoid, { slot: -1 });
    };

    const layoutChrome = () => {
        layoutChipRow(
            categoryTabs.map(({ id, chip }) => ({
                chip,
                active: id === state.category,
            }))
        );
        layoutChipRow(
            tagChips.map(({ tag, chip }) => ({
                chip,
                active: tag === state.tagFilter,
            }))
        );

        categoryRow.position.set(EDGE_PAD, EDGE_PAD);
        tagRow.position.set(EDGE_PAD, EDGE_PAD + TAB_HEIGHT + TAB_GAP);

        const top = EDGE_PAD + headerHeight() + SECTION_GAP;
        grid.position.set(EDGE_PAD + ITEM_BUTTON_SIZE / 2, top + ITEM_BUTTON_SIZE / 2);

        const pagerY = top + GRID_HEIGHT + SECTION_GAP + PAGER_HEIGHT / 2;
        pagerRoot.position.set(EDGE_PAD, pagerY);
        prevBtn.root.position.set(prevBtn.width / 2, 0);
        pageLabel.position.set(prevBtn.width + 6 + pageLabel.width / 2, 0);
        nextBtn.root.position.set(
            prevBtn.width + 6 + pageLabel.width + 6 + nextBtn.width / 2,
            0
        );

        // Search sits on the pager row (freecam-style), to the right of arrows.
        const pagerW =
            prevBtn.width + 6 + pageLabel.width + 6 + nextBtn.width;
        const searchX = EDGE_PAD + pagerW + 8;
        const searchY = pagerY - PAGER_HEIGHT / 2;
        searchInput.style.left = `${searchX}px`;
        searchInput.style.top = `${searchY}px`;
        searchInput.style.width = `${Math.max(80, GRID_WIDTH - pagerW - 8)}px`;
        searchInput.style.height = `${PAGER_HEIGHT}px`;
        searchInput.style.display = panelVisible ? "block" : "none";
        searchInput.placeholder = state.searchAll ? "Search all…" : "Search…";
    };

    const rebuildGrid = () => {
        for (const slot of slots) slot.destroy();
        slots = [];
        grid.removeChildren();

        const scope =
            state.searchAll && searchQuery.trim()
                ? "all"
                : state.category;
        filtered = fuzzyFilter(
            listCategoryItems(scope, state.tagFilter),
            searchQuery
        );
        pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
        page = Math.min(page, pageCount - 1);
        const slice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

        slice.forEach((entry, i) => {
            const slot = new ItemButton();
            slot.item = entry.id;
            slot.button.cursor = "pointer";

            slot.button.onpointerdown = (ev: {
                stopPropagation(): void;
                button?: number;
                clientX?: number;
                clientY?: number;
                shiftKey?: boolean;
            }) => {
                ev.stopPropagation();
                if (ev.button === 2) {
                    slot.rightDown = true;
                    return;
                }
                if (ev.button !== 0) return;
                slot.down = true;
                pressDragging = false;
                // Cursor held over a slot → void on release (inventory may also
                // void via isVoidTarget). Do not arm a give for this press.
                if (hooks.hasCursor()) {
                    pressItemId = null;
                    suppressNextGive = true;
                    return;
                }
                pressItemId = entry.id;
                pressShift = ev.shiftKey ?? false;
                pressX = ev.clientX ?? 0;
                pressY = ev.clientY ?? 0;
                suppressNextGive = false;
            };

            slot.button.onpointerup = (ev: {
                stopPropagation(): void;
                button?: number;
                shiftKey?: boolean;
            }) => {
                ev.stopPropagation();
                if (ev.button === 2) {
                    // Only act if this slot received the right-press (not a drop).
                    if (!slot.rightDown) return;
                    slot.rightDown = false;
                    // Holding a cursor over a slot voids instead of re-picking.
                    if (hooks.hasCursor()) {
                        voidCursor();
                    } else {
                        giveToCursor(entry.id, ev.shiftKey ?? false);
                    }
                    return;
                }
                if (ev.button !== 0) return;
                const originatedHere = slot.down;
                slot.down = false;

                // Drag-pick already handled; or void-armed press.
                if (suppressNextGive || pressDragging) {
                    pressItemId = null;
                    pressDragging = false;
                    suppressNextGive = false;
                    return;
                }
                // Drop from inventory / release over a foreign slot — never give.
                if (!originatedHere || pressItemId === null) {
                    pressItemId = null;
                    return;
                }
                if (hooks.hasCursor()) {
                    voidCursor();
                    pressItemId = null;
                    return;
                }
                give(pressItemId, pressShift);
                pressItemId = null;
            };

            slot.button.onpointerupoutside = () => {
                slot.down = false;
                slot.rightDown = false;
            };

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

    const onWindowPointerMove = (ev: PointerEvent) => {
        if (pressItemId === null || pressDragging) return;
        const dx = ev.clientX - pressX;
        const dy = ev.clientY - pressY;
        if (dx * dx + dy * dy < DRAG_THRESHOLD * DRAG_THRESHOLD) return;
        pressDragging = true;
        suppressNextGive = true;
        hideRegistryTooltip();
        // Drag from creative = pick onto cursor, then inventory owns the drop.
        giveToCursor(pressItemId, pressShift);
    };

    const onWindowPointerUp = () => {
        pressItemId = null;
        pressDragging = false;
    };

    window.addEventListener("pointermove", onWindowPointerMove);
    window.addEventListener("pointerup", onWindowPointerUp);

    const rebuild = () => {
        rebuildTagRow();
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
            const pagerY =
                EDGE_PAD +
                headerHeight() +
                SECTION_GAP +
                GRID_HEIGHT +
                SECTION_GAP;
            const searchBox =
                screenX >= EDGE_PAD &&
                screenX <= EDGE_PAD + GRID_WIDTH &&
                screenY >= pagerY &&
                screenY <= pagerY + PAGER_HEIGHT;
            return (
                searchBox ||
                (screenX >= bounds.x - 8 &&
                    screenX <=
                        bounds.x + Math.max(bounds.width, GRID_WIDTH) + 8 &&
                    screenY >= bounds.y - 8 &&
                    screenY <= bounds.y + bounds.height + 8)
            );
        },
        destroy() {
            window.removeEventListener("pointermove", onWindowPointerMove);
            window.removeEventListener("pointerup", onWindowPointerUp);
            hideRegistryTooltip();
            searchInput.remove();
            for (const slot of slots) slot.destroy();
            container.destroy({ children: true });
        },
    };
}
