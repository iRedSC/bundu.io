import { AdminPlaceKind } from "@bundu/shared/packet_definitions";
import type { Registry, RegistryName, TagLocation } from "@bundu/shared/registry";
import { Container, Graphics, Text } from "pixi.js";
import { percentOf } from "@bundu/shared/math";
import { ITEM_BUTTON_SIZE } from "../constants";
import { SpriteFactory, type ContaineredSprite } from "../assets/sprite_factory";
import { tickItemButton, type ItemButtonColors } from "../ui/item_button";
import { clientRegistries, clientGroundType, clientVisualId } from "../configs/registries";
import { mountSlotIcon } from "../visual/slot_icon";
import {
    categoryToKind,
    type EditorCategory,
    type EditorState,
    type PaletteEntry,
} from "./state";

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
];

const SLOT_GAP = 8;
const TAB_HEIGHT = 28;
const TAB_GAP = 4;
const EDGE_PAD = 10;
const SLOT_STRIDE = ITEM_BUTTON_SIZE + SLOT_GAP;

function categoryRegistry(category: EditorCategory): Registry<RegistryName> {
    const registries = clientRegistries();
    switch (category) {
        case "resources":
            return registries.resource;
        case "ground":
            return registries.ground_type;
        case "structures":
            return registries.structure;
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
            entries.push({
                id,
                kind,
                location: clientVisualId(registry.location(id)),
            });
        }
    } else {
        for (const [location, id] of registry.entries()) {
            entries.push({
                id,
                kind,
                location: clientVisualId(location),
            });
        }
    }

    entries.sort((a, b) => a.location.localeCompare(b.location));
    return entries;
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
    private clearIcon: (() => void) | undefined;

    get item(): number | null {
        return this.entry?.id ?? null;
    }

    /** Alias for tickItemButton. */
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

        this.button.onpointerenter = () => {
            this.hovering = true;
        };
        this.button.onpointerleave = () => {
            this.hovering = false;
            this.down = false;
        };
        this.button.onpointerdown = (e: { stopPropagation(): void }) => {
            e.stopPropagation();
            this.down = true;
        };
        this.button.onpointerupoutside = () => {
            this.down = false;
        };
    }

    setEntry(entry: PaletteEntry | null) {
        this.entry = entry;
        this.clearIcon?.();
        this.clearIcon = undefined;

        if (!entry) {
            this.itemDisplay.visible = false;
            return;
        }

        this.itemDisplay.visible = true;
        const size = percentOf(90, ITEM_BUTTON_SIZE);

        if (entry.kind === AdminPlaceKind.Ground) {
            const hex = clientGroundType(entry.id).color.replace("#", "");
            const color = Number.parseInt(hex, 16);
            const g = new Graphics();
            const swatch = percentOf(70, ITEM_BUTTON_SIZE);
            g.roundRect(-swatch / 2, -swatch / 2, swatch, swatch, 4).fill(color);
            this.itemDisplay.addChild(g);
            return;
        }

        this.clearIcon = mountSlotIcon(entry.location, this.itemDisplay, size);
    }

    tick(now?: number) {
        tickItemButton(
            this as never,
            SLOT_COLORS,
            0,
            this.selected ? 0.92 : 1,
            now
        );
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

export type PaletteHandle = {
    container: Container;
    rebuild: () => void;
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

    const slotGrid = new Container();
    slotGrid.eventMode = "static";
    container.addChild(slotGrid);

    const slots: PaletteSlot[] = [];
    let entries: PaletteEntry[] = [];
    let layoutWidth = ITEM_BUTTON_SIZE + EDGE_PAD * 2;

    const categoryTabs: { id: EditorCategory; chip: TabChip }[] = [];
    let tagChips: { tag: string | null; chip: TabChip }[] = [];

    for (const tab of TAB_LABELS) {
        const chip = makeTabChip(
            tab.label,
            () => {
                if (state.category === tab.id) return;
                state.category = tab.id;
                state.tagFilter = null;
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

        // Drop stale filter if the category has no such tag.
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

    function rowsPerColumn(): number {
        const top = EDGE_PAD + headerHeight() + SLOT_GAP;
        const available = window.innerHeight - top - EDGE_PAD;
        return Math.max(1, Math.floor((available + SLOT_GAP) / SLOT_STRIDE));
    }

    function ensureSlots(count: number) {
        while (slots.length < count) {
            const slot = new PaletteSlot();
            slot.button.onpointerup = (e: { stopPropagation(): void }) => {
                e.stopPropagation();
                slot.down = false;
                const entry = slot.entry;
                if (!entry) return;
                state.selected = entry;
                for (const other of slots) {
                    other.selected = other.entry?.id === entry.id;
                }
                onChange();
            };
            slots.push(slot);
            slotGrid.addChild(slot.button);
        }
    }

    function rebuild() {
        rebuildTagRow();
        entries = listEntries(state.category, state.tagFilter);

        const categoryWidth = layoutChipRow(
            categoryTabs.map(({ id, chip }) => ({
                chip,
                active: id === state.category,
            }))
        );
        const tagWidth = layoutChipRow(
            tagChips.map(({ tag, chip }) => ({
                chip,
                active: tag === state.tagFilter,
            }))
        );

        const rows = rowsPerColumn();
        const cols = Math.max(1, Math.ceil(Math.max(entries.length, 1) / rows));
        ensureSlots(entries.length);

        if (
            state.selected &&
            !entries.some((entry) => entry.id === state.selected?.id)
        ) {
            state.selected = entries[0] ?? null;
        } else if (!state.selected) {
            state.selected = entries[0] ?? null;
        }

        const slotsTop = EDGE_PAD + headerHeight() + SLOT_GAP;
        slotGrid.position.set(
            EDGE_PAD + ITEM_BUTTON_SIZE / 2,
            slotsTop + ITEM_BUTTON_SIZE / 2
        );

        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            if (!slot) continue;
            const entry = entries[i];
            if (!entry) {
                slot.button.visible = false;
                continue;
            }
            const col = Math.floor(i / rows);
            const row = i % rows;
            slot.button.visible = true;
            slot.setEntry(entry);
            slot.selected = entry.id === state.selected?.id;
            slot.button.position.set(col * SLOT_STRIDE, row * SLOT_STRIDE);
        }

        layoutWidth = Math.max(
            categoryWidth + EDGE_PAD * 2,
            tagWidth + EDGE_PAD * 2,
            EDGE_PAD * 2 + cols * SLOT_STRIDE - SLOT_GAP
        );
    }

    function resize() {
        container.position.set(0, 0);
        categoryRow.position.set(EDGE_PAD, EDGE_PAD);
        tagRow.position.set(EDGE_PAD, EDGE_PAD + TAB_HEIGHT + TAB_GAP);
        rebuild();
    }

    window.addEventListener("resize", resize);
    resize();

    return {
        container,
        rebuild,
        tick(now?: number) {
            for (const slot of slots) {
                if (slot.button.visible) slot.tick(now);
            }
        },
        containsPoint(screenX: number, _screenY: number) {
            return screenX >= 0 && screenX <= layoutWidth;
        },
        destroy() {
            window.removeEventListener("resize", resize);
            for (const slot of slots) slot.destroy();
            container.destroy({ children: true });
        },
    };
}
