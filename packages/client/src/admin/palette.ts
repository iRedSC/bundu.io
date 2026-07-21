import { AdminPlaceKind } from "@bundu/shared/packet_definitions";
import type { Registry, RegistryName, TagLocation } from "@bundu/shared/registry";
import { Container, Graphics, Text } from "pixi.js";
import { percentOf } from "@bundu/shared/math";
import { ITEM_BUTTON_SIZE } from "../constants";
import { SpriteFactory, type ContaineredSprite } from "../assets/sprite_factory";
import { tickItemButton, type ItemButtonColors } from "../ui/item_button";
import {
    clientRegistries,
    clientGroundType,
    clientModelId,
} from "../configs/registries";
import { mountSlotIcon } from "../models/mount";
import { lookupModel } from "../models/defs";
import { decorationModelId } from "../world/decoration";
import { groundModel } from "../world/ground";
import {
    categoryToKind,
    type EditorCategory,
    type EditorState,
    type PaletteEntry,
} from "./state";
import {
    hideRegistryTooltip,
    moveRegistryTooltip,
    placeKindRegistry,
    showRegistryTooltip,
} from "../ui/registry_tooltip";

const UI_FONT = "'Aoboshi One', sans-serif";

const SLOT_COLORS: ItemButtonColors = {
    empty: 0x1a2218,
    default: 0x3a4a32,
    hover: 0x6a8058,
    down: 0x1a2218,
    rightDown: 0x6a8058,
};

const TAB_LABELS: { id: EditorCategory; label: string }[] = [
    { id: "resources", label: "Resources" },
    { id: "ground", label: "Ground" },
    { id: "structures", label: "Structures" },
    { id: "decorations", label: "Decorations" },
];

const SLOT_GAP = 8;
const TAB_HEIGHT = 28;
const TAB_GAP = 4;
const EDGE_PAD = 10;
const SLOT_STRIDE = ITEM_BUTTON_SIZE + SLOT_GAP;
const PANEL_COLS = 3;
const PAGER_HEIGHT = 28;
const SECTION_GAP = 12;
const GRID_WIDTH = PANEL_COLS * SLOT_STRIDE - SLOT_GAP;

function categoryRegistry(category: EditorCategory): Registry<RegistryName> {
    const registries = clientRegistries();
    switch (category) {
        case "resources":
            return registries.resource;
        case "ground":
            return registries.ground_type;
        case "structures":
            return registries.structure;
        case "decorations":
            return registries.decoration;
    }
}

function tagLabel(tag: TagLocation): string {
    const path = tag.slice(tag.indexOf(":") + 1);
    return path.replaceAll("_", " ");
}

function listTags(category: EditorCategory): { tag: TagLocation; label: string }[] {
    const tags: { tag: TagLocation; label: string }[] = [];
    for (const [tag] of categoryRegistry(category).categoryTagEntries()) {
        tags.push({ tag, label: tagLabel(tag) });
    }
    tags.sort((a, b) => a.label.localeCompare(b.label));
    return tags;
}

function listEntries(
    category: EditorCategory,
    tagFilter: string | null
): PaletteEntry[] {
    const kind = categoryToKind(category);
    const registry = categoryRegistry(category);
    const entries: PaletteEntry[] = [];

    if (tagFilter) {
        for (const id of registry.resolveSet([tagFilter], undefined, "editor.tag")) {
            const location = registry.location(id);
            entries.push({
                id,
                kind,
                location:
                    category === "decorations"
                        ? decorationModelId(location)
                        : clientModelId(location),
            });
        }
    } else {
        for (const [location, id] of registry.entries()) {
            entries.push({
                id,
                kind,
                location:
                    category === "decorations"
                        ? decorationModelId(location)
                        : clientModelId(location),
            });
        }
    }

    entries.sort((a, b) => a.location.localeCompare(b.location));
    return entries;
}

function entryVariants(entry: PaletteEntry | null): string[] {
    if (!entry) return [];
    if (
        entry.kind === AdminPlaceKind.Ground ||
        entry.kind === AdminPlaceKind.Decoration
    ) {
        return [];
    }
    const def = lookupModel(entry.location);
    return Object.keys(def?.variants ?? {}).sort((a, b) => a.localeCompare(b));
}

function fuzzyRank(value: string, query: string): number | undefined {
    if (!query) return 0;
    const v = value.toLowerCase();
    const bare = v.includes(":") ? v.slice(v.indexOf(":") + 1) : v;
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

function fuzzyFilter<T>(
    items: readonly T[],
    query: string,
    key: (item: T) => string
): T[] {
    const lower = query.trim().toLowerCase();
    if (!lower) return [...items];
    const hits: { item: T; rank: number }[] = [];
    for (const item of items) {
        const rank = fuzzyRank(key(item), lower);
        if (rank !== undefined) hits.push({ item, rank });
    }
    hits.sort(
        (a, b) => b.rank - a.rank || key(a.item).localeCompare(key(b.item))
    );
    return hits.map((h) => h.item);
}

class PaletteSlot {
    readonly button: Container;
    readonly background: ContaineredSprite;
    readonly itemDisplay: Container;
    readonly disableSprite: ContaineredSprite;
    hovering = false;
    down = false;
    rightDown = false;
    selected = false;
    entry: PaletteEntry | null = null;
    variant: string | null = null;
    private clearIcon: (() => void) | undefined;

    get item(): number | null {
        return this.entry?.id ?? null;
    }

    get itemSprite(): Container {
        return this.itemDisplay;
    }

    constructor() {
        this.button = new Container();
        this.button.sortableChildren = true;
        this.button.eventMode = "static";
        this.button.cursor = "pointer";

        this.background = SpriteFactory.build("bundu/ui/item_button.png");
        this.background.width = ITEM_BUTTON_SIZE;
        this.background.height = ITEM_BUTTON_SIZE;
        this.background.anchor.set(0.5);
        this.background.tint = SLOT_COLORS.empty;

        this.disableSprite = SpriteFactory.build("bundu/ui/item_button.png");
        this.disableSprite.width = ITEM_BUTTON_SIZE;
        this.disableSprite.height = ITEM_BUTTON_SIZE;
        this.disableSprite.tint = 0x000000;
        this.disableSprite.alpha = 0.5;
        this.disableSprite.zIndex = 1000;
        this.disableSprite.visible = false;
        this.disableSprite.anchor.set(0.5);

        this.itemDisplay = new Container();
        this.itemDisplay.zIndex = 1;

        this.button.addChild(this.itemDisplay);
        this.button.addChild(this.background);
        this.button.addChild(this.disableSprite);

        this.button.onpointerenter = (ev: {
            global: { x: number; y: number };
        }) => {
            this.hovering = true;
            this.showTip(ev.global.x, ev.global.y);
        };
        this.button.onpointermove = (ev: {
            global: { x: number; y: number };
        }) => {
            if (!this.hovering) return;
            moveRegistryTooltip(ev.global.x, ev.global.y);
        };
        this.button.onpointerleave = () => {
            this.hovering = false;
            this.down = false;
            hideRegistryTooltip();
        };
        this.button.onpointerdown = (e: { stopPropagation(): void }) => {
            e.stopPropagation();
            this.down = true;
            hideRegistryTooltip();
        };
        this.button.onpointerupoutside = () => {
            this.down = false;
        };
    }

    private showTip(screenX: number, screenY: number) {
        if (this.variant) {
            // Variant names aren't registry entries — skip tooltip.
            hideRegistryTooltip();
            return;
        }
        if (!this.entry) {
            hideRegistryTooltip();
            return;
        }
        const registry = placeKindRegistry(this.entry.kind);
        const location = clientRegistries()[registry].location(this.entry.id);
        showRegistryTooltip(registry, location, screenX, screenY);
    }

    setObject(entry: PaletteEntry | null) {
        this.entry = entry;
        this.variant = null;
        this.clearIcon?.();
        this.clearIcon = undefined;
        this.itemDisplay.removeChildren();

        if (!entry) {
            this.itemDisplay.visible = false;
            return;
        }

        this.itemDisplay.visible = true;
        const size = percentOf(90, ITEM_BUTTON_SIZE);

        if (entry.kind === AdminPlaceKind.Ground) {
            const hex = groundModel(clientGroundType(entry.id).model).color.replace(
                "#",
                ""
            );
            const color = Number.parseInt(hex, 16);
            const g = new Graphics();
            const swatch = percentOf(70, ITEM_BUTTON_SIZE);
            g.roundRect(-swatch / 2, -swatch / 2, swatch, swatch, 4).fill(color);
            this.itemDisplay.addChild(g);
            return;
        }

        this.clearIcon = mountSlotIcon(entry.location, this.itemDisplay, size);
    }

    setVariant(modelId: string, variant: string) {
        this.entry = null;
        this.variant = variant;
        this.clearIcon?.();
        this.clearIcon = undefined;
        this.itemDisplay.removeChildren();
        this.itemDisplay.visible = true;
        const size = percentOf(90, ITEM_BUTTON_SIZE);
        this.clearIcon = mountSlotIcon(modelId, this.itemDisplay, size, variant);
    }

    tick(now?: number) {
        tickItemButton(this, SLOT_COLORS, 0, this.selected ? 0.92 : 1, now);
    }

    destroy() {
        this.clearIcon?.();
        this.button.destroy({ children: true });
    }
}

type TabChip = {
    root: Container;
    bg: Graphics;
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

    return { root, bg, label, setActive };
}

type PagerHandle = {
    root: Container;
    setPage: (page: number, pageCount: number) => void;
    destroy: () => void;
    hitWidth: () => number;
};

function makePager(
    onPrev: () => void,
    onNext: () => void
): PagerHandle {
    const root = new Container();
    root.eventMode = "static";

    const prev = makePagerBtn("←", onPrev);
    const next = makePagerBtn("→", onNext);
    const label = new Text({
        text: "0/0",
        style: { fontFamily: UI_FONT, fill: "#ffffff", fontSize: 13 },
    });
    label.anchor.set(0.5);

    root.addChild(prev.root);
    root.addChild(label);
    root.addChild(next.root);

    const setPage = (page: number, pageCount: number) => {
        const safeCount = Math.max(1, pageCount);
        const safePage = Math.min(Math.max(0, page), safeCount - 1);
        label.text = `${safePage + 1}/${safeCount}`;
        const gap = 6;
        prev.root.position.set(0, 0);
        label.position.set(prev.width + gap + label.width / 2, 0);
        next.root.position.set(
            prev.width + gap + label.width + gap + next.width / 2,
            0
        );
        prev.setEnabled(safePage > 0);
        next.setEnabled(safePage < safeCount - 1);
    };
    setPage(0, 1);

    return {
        root,
        setPage,
        destroy: () => root.destroy({ children: true }),
        hitWidth: () =>
            prev.width + 6 + label.width + 6 + next.width,
    };
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
    const h = PAGER_HEIGHT;
    bg.roundRect(-w / 2, -h / 2, w, h, 4).fill(0x2a3224);
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

export type PaletteHandle = {
    container: Container;
    rebuild: () => void;
    setVisible: (visible: boolean) => void;
    tick: (now?: number) => void;
    containsPoint: (screenX: number, screenY: number) => boolean;
    destroy: () => void;
};

export function createPalette(
    state: EditorState,
    onChange: () => void
): PaletteHandle {
    const container = new Container();
    container.eventMode = "static";

    const categoryRow = new Container();
    categoryRow.eventMode = "static";
    container.addChild(categoryRow);

    const tagRow = new Container();
    tagRow.eventMode = "static";
    container.addChild(tagRow);

    const objectSection = new Container();
    objectSection.eventMode = "static";
    container.addChild(objectSection);

    const objectGrid = new Container();
    objectGrid.eventMode = "static";
    objectSection.addChild(objectGrid);

    const variantSection = new Container();
    variantSection.eventMode = "static";
    container.addChild(variantSection);

    const variantGrid = new Container();
    variantGrid.eventMode = "static";
    variantSection.addChild(variantGrid);

    const objectSlots: PaletteSlot[] = [];
    const variantSlots: PaletteSlot[] = [];

    let allEntries: PaletteEntry[] = [];
    let filteredEntries: PaletteEntry[] = [];
    let filteredVariants: string[] = [];

    let objectPage = 0;
    let variantPage = 0;
    let objectQuery = "";
    let variantQuery = "";
    let objectPageCount = 1;
    let variantPageCount = 1;
    let objectPageSize = PANEL_COLS;
    let variantPageSize = PANEL_COLS;

    const categoryTabs: { id: EditorCategory; chip: TabChip }[] = [];
    let tagChips: { tag: string | null; chip: TabChip }[] = [];

    const objectPager = makePager(
        () => {
            if (objectPage <= 0) return;
            objectPage -= 1;
            rebuildGrids();
        },
        () => {
            if (objectPage >= objectPageCount - 1) return;
            objectPage += 1;
            rebuildGrids();
        }
    );
    objectSection.addChild(objectPager.root);

    const variantPager = makePager(
        () => {
            if (variantPage <= 0) return;
            variantPage -= 1;
            rebuildGrids();
        },
        () => {
            if (variantPage >= variantPageCount - 1) return;
            variantPage += 1;
            rebuildGrids();
        }
    );
    variantSection.addChild(variantPager.root);

    const objectSearch = createSearchInput((query) => {
        objectQuery = query;
        objectPage = 0;
        rebuildGrids();
    });
    const variantSearch = createSearchInput((query) => {
        variantQuery = query;
        variantPage = 0;
        rebuildGrids();
    });

    for (const tab of TAB_LABELS) {
        const chip = makeTabChip(
            tab.label,
            () => {
                if (state.category === tab.id) return;
                state.category = tab.id;
                state.tagFilter = null;
                objectPage = 0;
                objectQuery = "";
                objectSearch.value = "";
                rebuild();
                onChange();
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

        const tags = listTags(state.category);
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
                    objectPage = 0;
                    rebuild();
                    onChange();
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

    function ensureSlots(list: PaletteSlot[], parent: Container, count: number) {
        while (list.length < count) {
            const slot = new PaletteSlot();
            list.push(slot);
            parent.addChild(slot.button);
        }
    }

    function syncSelectedVariant(
        variants: string[],
        defaultVariant: string | undefined
    ) {
        if (variants.length === 0) {
            state.selectedVariant = null;
            return;
        }
        if (
            state.selectedVariant === null ||
            !variants.includes(state.selectedVariant)
        ) {
            state.selectedVariant =
                (defaultVariant && variants.includes(defaultVariant)
                    ? defaultVariant
                    : variants[0]) ?? null;
        }
    }

    function selectObject(entry: PaletteEntry) {
        state.selected = entry;
        const variants = entryVariants(entry);
        const defaultVariant = lookupModel(entry.location)?.defaultVariant;
        variantPage = 0;
        variantQuery = "";
        variantSearch.value = "";
        state.selectedVariant = null;
        syncSelectedVariant(variants, defaultVariant);
        rebuildGrids();
        onChange();
    }

    function selectVariant(name: string) {
        state.selectedVariant = name;
        rebuildGrids();
        onChange();
    }

    function sectionMetrics(totalHeight: number): {
        objectH: number;
        variantH: number;
        objectRows: number;
        variantRows: number;
    } {
        const objectH = Math.floor(totalHeight * (2 / 3));
        const variantH = Math.max(0, totalHeight - objectH);
        const objectGridH = Math.max(0, objectH - PAGER_HEIGHT - SLOT_GAP);
        const variantGridH = Math.max(0, variantH - PAGER_HEIGHT - SLOT_GAP);
        return {
            objectH,
            variantH,
            objectRows: Math.max(1, Math.floor((objectGridH + SLOT_GAP) / SLOT_STRIDE)),
            variantRows: Math.max(1, Math.floor((variantGridH + SLOT_GAP) / SLOT_STRIDE)),
        };
    }

    function rebuildGrids() {
        const top = EDGE_PAD + headerHeight() + SLOT_GAP;
        const available = Math.max(
            SLOT_STRIDE * 2 + PAGER_HEIGHT * 2 + SECTION_GAP,
            window.innerHeight - top - EDGE_PAD
        );
        const metrics = sectionMetrics(available);

        objectSection.position.set(EDGE_PAD, top);
        variantSection.position.set(
            EDGE_PAD,
            top + metrics.objectH + SECTION_GAP
        );

        objectPageSize = metrics.objectRows * PANEL_COLS;
        variantPageSize = metrics.variantRows * PANEL_COLS;

        filteredEntries = fuzzyFilter(
            allEntries,
            objectQuery,
            (entry) => entry.location
        );
        objectPageCount = Math.max(
            1,
            Math.ceil(filteredEntries.length / objectPageSize)
        );
        objectPage = Math.min(objectPage, objectPageCount - 1);

        const variants = entryVariants(state.selected);
        filteredVariants = fuzzyFilter(variants, variantQuery, (name) => name);
        variantPageCount = Math.max(
            1,
            Math.ceil(Math.max(filteredVariants.length, 1) / variantPageSize)
        );
        if (filteredVariants.length === 0) variantPageCount = 1;
        variantPage = Math.min(variantPage, variantPageCount - 1);
        syncSelectedVariant(
            variants,
            state.selected
                ? lookupModel(state.selected.location)?.defaultVariant
                : undefined
        );

        const objectSlice = filteredEntries.slice(
            objectPage * objectPageSize,
            (objectPage + 1) * objectPageSize
        );
        ensureSlots(objectSlots, objectGrid, objectPageSize);
        objectGrid.position.set(ITEM_BUTTON_SIZE / 2, ITEM_BUTTON_SIZE / 2);
        for (let i = 0; i < objectSlots.length; i++) {
            const slot = objectSlots[i];
            if (!slot) continue;
            const entry = objectSlice[i];
            if (!entry || i >= objectPageSize) {
                slot.button.visible = false;
                continue;
            }
            const col = i % PANEL_COLS;
            const row = Math.floor(i / PANEL_COLS);
            slot.button.visible = true;
            slot.setObject(entry);
            slot.selected =
                entry.id === state.selected?.id &&
                entry.kind === state.selected.kind;
            slot.button.position.set(col * SLOT_STRIDE, row * SLOT_STRIDE);
            slot.button.onpointerup = (e: { stopPropagation(): void }) => {
                e.stopPropagation();
                slot.down = false;
                if (!slot.entry) return;
                selectObject(slot.entry);
            };
        }

        objectPager.setPage(objectPage, objectPageCount);
        objectPager.root.position.set(
            0,
            metrics.objectRows * SLOT_STRIDE + SLOT_GAP + PAGER_HEIGHT / 2
        );

        const variantSlice = filteredVariants.slice(
            variantPage * variantPageSize,
            (variantPage + 1) * variantPageSize
        );
        ensureSlots(variantSlots, variantGrid, variantPageSize);
        variantGrid.position.set(ITEM_BUTTON_SIZE / 2, ITEM_BUTTON_SIZE / 2);
        const modelId = state.selected?.location;
        for (let i = 0; i < variantSlots.length; i++) {
            const slot = variantSlots[i];
            if (!slot) continue;
            const name = variantSlice[i];
            if (!name || !modelId || i >= variantPageSize) {
                slot.button.visible = false;
                continue;
            }
            const col = i % PANEL_COLS;
            const row = Math.floor(i / PANEL_COLS);
            slot.button.visible = true;
            slot.setVariant(modelId, name);
            slot.selected = name === state.selectedVariant;
            slot.button.position.set(col * SLOT_STRIDE, row * SLOT_STRIDE);
            slot.button.onpointerup = (e: { stopPropagation(): void }) => {
                e.stopPropagation();
                slot.down = false;
                if (!slot.variant) return;
                selectVariant(slot.variant);
            };
        }

        variantPager.setPage(variantPage, variantPageCount);
        variantPager.root.position.set(
            0,
            metrics.variantRows * SLOT_STRIDE + SLOT_GAP + PAGER_HEIGHT / 2
        );

        layoutSearchInputs(metrics.objectRows, metrics.variantRows);
    }

    function layoutSearchInputs(objectRows: number, variantRows: number) {
        const canvas = document.querySelector("canvas");
        const canvasRect = canvas?.getBoundingClientRect();
        const originX = canvasRect?.left ?? 0;
        const originY = canvasRect?.top ?? 0;

        const placeInput = (
            input: HTMLInputElement,
            sectionY: number,
            rows: number,
            pager: PagerHandle
        ) => {
            const pagerY =
                sectionY + rows * SLOT_STRIDE + SLOT_GAP + PAGER_HEIGHT / 2;
            const pagerW = pager.hitWidth();
            const x = originX + EDGE_PAD + pagerW + 8;
            const y = originY + pagerY - PAGER_HEIGHT / 2;
            const width = Math.max(80, GRID_WIDTH - pagerW - 8);
            input.style.display = "block";
            input.style.left = `${x}px`;
            input.style.top = `${y}px`;
            input.style.width = `${width}px`;
            input.style.height = `${PAGER_HEIGHT}px`;
        };

        const top = EDGE_PAD + headerHeight() + SLOT_GAP;
        const available = Math.max(
            SLOT_STRIDE * 2 + PAGER_HEIGHT * 2 + SECTION_GAP,
            window.innerHeight - top - EDGE_PAD
        );
        const metrics = sectionMetrics(available);
        placeInput(objectSearch, top, objectRows, objectPager);
        placeInput(
            variantSearch,
            top + metrics.objectH + SECTION_GAP,
            variantRows,
            variantPager
        );
    }

    function rebuild() {
        rebuildTagRow();
        allEntries = listEntries(state.category, state.tagFilter);

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

        const selectedStillVisible =
            state.selected !== null &&
            allEntries.some(
                (entry) =>
                    entry.id === state.selected?.id &&
                    entry.kind === state.selected.kind
            );
        if (!selectedStillVisible) {
            state.selected = allEntries[0] ?? null;
            syncSelectedVariant(
                entryVariants(state.selected),
                state.selected
                    ? lookupModel(state.selected.location)?.defaultVariant
                    : undefined
            );
        } else {
            syncSelectedVariant(
                entryVariants(state.selected),
                state.selected
                    ? lookupModel(state.selected.location)?.defaultVariant
                    : undefined
            );
        }

        rebuildGrids();
    }

    function resize() {
        container.position.set(0, 0);
        categoryRow.position.set(EDGE_PAD, EDGE_PAD);
        tagRow.position.set(EDGE_PAD, EDGE_PAD + TAB_HEIGHT + TAB_GAP);
        rebuild();
    }

    const onWindowResize = () => resize();
    window.addEventListener("resize", onWindowResize);
    resize();
    // Editor starts hidden; don't leave search inputs on the page.
    objectSearch.style.display = "none";
    variantSearch.style.display = "none";

    return {
        container,
        rebuild,
        setVisible(visible: boolean) {
            container.visible = visible;
            if (!visible) {
                objectSearch.style.display = "none";
                variantSearch.style.display = "none";
                return;
            }
            rebuildGrids();
        },
        tick(now?: number) {
            for (const slot of objectSlots) {
                if (slot.button.visible) slot.tick(now);
            }
            for (const slot of variantSlots) {
                if (slot.button.visible) slot.tick(now);
            }
        },
        containsPoint(screenX: number, screenY: number) {
            const panelRight = EDGE_PAD + GRID_WIDTH + 8;
            const panelBottom = window.innerHeight - EDGE_PAD + 8;
            if (
                screenX >= 0 &&
                screenX <= panelRight &&
                screenY >= 0 &&
                screenY <= panelBottom
            ) {
                return true;
            }
            const bounds = container.getBounds();
            return (
                screenX >= bounds.x - 8 &&
                screenX <= bounds.x + bounds.width + 8 &&
                screenY >= bounds.y - 8 &&
                screenY <= bounds.y + bounds.height + 8
            );
        },
        destroy() {
            hideRegistryTooltip();
            window.removeEventListener("resize", onWindowResize);
            objectSearch.remove();
            variantSearch.remove();
            for (const slot of objectSlots) slot.destroy();
            for (const slot of variantSlots) slot.destroy();
            objectPager.destroy();
            variantPager.destroy();
            container.destroy({ children: true });
        },
    };
}
