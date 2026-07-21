import { AdminPlaceKind } from "@bundu/shared/packet_definitions";

export type EditorCategory =
    | "resources"
    | "ground"
    | "structures"
    | "decorations";
/** Look = pan/view only; Place / Delete mutate the map. */
export type EditorTool = "look" | "place" | "delete";
/** Ground place brush: drag AABB, or paint one tile at a time. */
export type GroundBrush = "rect" | "tile";

export type PaletteEntry = {
    id: number;
    kind: AdminPlaceKind;
    location: string;
};

export type EditorState = {
    category: EditorCategory;
    /** Selected tag filter, or null for all entries in the category. */
    tagFilter: string | null;
    selected: PaletteEntry | null;
    /** Variant name for the selected object; null when the model has none. */
    selectedVariant: string | null;
    tool: EditorTool;
    drag: boolean;
    /**
     * How ground is stamped while placing.
     * `rect` = click-drag AABB; `tile` = 1×1 paint (irregular shapes).
     */
    groundBrush: GroundBrush;
    randomVariant: boolean;
    randomRotation: boolean;
    animalsFrozen: boolean;
    /** Show freecam ghost cursor to non-freecam players (default off). */
    ghostVisible: boolean;
    showGrid: boolean;
    /** Tile rotation 0–3 (resources / structures). */
    rotation: TileRot;
    /** Continuous degrees for decorations. */
    decorationRotation: number;
    /** Free-float size multiplier for decorations. */
    decorationScale: number;
};

export type TileRot = 0 | 1 | 2 | 3;

export function createEditorState(): EditorState {
    return {
        category: "resources",
        tagFilter: null,
        selected: null,
        selectedVariant: null,
        tool: "look",
        drag: true,
        groundBrush: "rect",
        randomVariant: false,
        randomRotation: false,
        animalsFrozen: false,
        ghostVisible: false,
        showGrid: true,
        rotation: 0,
        decorationRotation: 0,
        decorationScale: 1,
    };
}

export function categoryToKind(category: EditorCategory): AdminPlaceKind {
    switch (category) {
        case "resources":
            return AdminPlaceKind.Resource;
        case "ground":
            return AdminPlaceKind.Ground;
        case "structures":
            return AdminPlaceKind.Structure;
        case "decorations":
            return AdminPlaceKind.Decoration;
    }
}

export function cycleRotation(rotation: TileRot): TileRot {
    return ((rotation + 1) % 4) as TileRot;
}
