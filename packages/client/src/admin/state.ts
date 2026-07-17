import { AdminPlaceKind } from "@bundu/shared/packet_definitions";

export type EditorCategory = "resources" | "ground" | "structures";
export type EditorTool = "place" | "delete";

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
    tool: EditorTool;
    drag: boolean;
    randomVariant: boolean;
    randomRotation: boolean;
    animalsFrozen: boolean;
    showGrid: boolean;
    /** Tile rotation 0–3. */
    rotation: TileRot;
};

export type TileRot = 0 | 1 | 2 | 3;

export function createEditorState(): EditorState {
    return {
        category: "resources",
        tagFilter: null,
        selected: null,
        tool: "place",
        drag: true,
        randomVariant: false,
        randomRotation: false,
        animalsFrozen: false,
        showGrid: true,
        rotation: 0,
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
    }
}

export function cycleRotation(rotation: TileRot): TileRot {
    return ((rotation + 1) % 4) as TileRot;
}
