import type { EditorState, EditorTool, GroundBrush } from "./state";

const PREFS_KEY = "bundu.admin_editor";

/** Toolbar prefs restored for the browser tab session. */
export type EditorPrefs = {
    tool: EditorTool;
    drag: boolean;
    groundBrush: GroundBrush;
    randomVariant: boolean;
    randomRotation: boolean;
    showGrid: boolean;
    /** Desired while freecam is active; re-sent on enter. */
    animalsFrozen: boolean;
    ghostVisible: boolean;
};

const TOOLS: ReadonlySet<string> = new Set(["look", "place", "delete"]);

function isTool(value: unknown): value is EditorTool {
    return typeof value === "string" && TOOLS.has(value);
}

function isGroundBrush(value: unknown): value is GroundBrush {
    return value === "rect" || value === "tile";
}

function isBoolean(value: unknown): value is boolean {
    return typeof value === "boolean";
}

/** Load prefs from sessionStorage; missing/invalid fields are skipped. */
export function loadEditorPrefs(): Partial<EditorPrefs> {
    try {
        const raw = sessionStorage.getItem(PREFS_KEY);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object") return {};
        const data = parsed as Record<string, unknown>;
        const prefs: Partial<EditorPrefs> = {};
        if (isTool(data.tool)) prefs.tool = data.tool;
        if (isBoolean(data.drag)) prefs.drag = data.drag;
        if (isGroundBrush(data.groundBrush)) prefs.groundBrush = data.groundBrush;
        if (isBoolean(data.randomVariant)) prefs.randomVariant = data.randomVariant;
        if (isBoolean(data.randomRotation))
            prefs.randomRotation = data.randomRotation;
        if (isBoolean(data.showGrid)) prefs.showGrid = data.showGrid;
        if (isBoolean(data.animalsFrozen)) prefs.animalsFrozen = data.animalsFrozen;
        if (isBoolean(data.ghostVisible)) prefs.ghostVisible = data.ghostVisible;
        return prefs;
    } catch {
        return {};
    }
}

export function saveEditorPrefs(state: EditorState): void {
    const prefs: EditorPrefs = {
        tool: state.tool,
        drag: state.drag,
        groundBrush: state.groundBrush,
        randomVariant: state.randomVariant,
        randomRotation: state.randomRotation,
        showGrid: state.showGrid,
        animalsFrozen: state.animalsFrozen,
        ghostVisible: state.ghostVisible,
    };
    try {
        sessionStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
        // Quota / private mode — ignore.
    }
}

export function applyEditorPrefs(
    state: EditorState,
    prefs: Partial<EditorPrefs>
): void {
    if (prefs.tool !== undefined) state.tool = prefs.tool;
    if (prefs.drag !== undefined) state.drag = prefs.drag;
    if (prefs.groundBrush !== undefined) state.groundBrush = prefs.groundBrush;
    if (prefs.randomVariant !== undefined)
        state.randomVariant = prefs.randomVariant;
    if (prefs.randomRotation !== undefined)
        state.randomRotation = prefs.randomRotation;
    if (prefs.showGrid !== undefined) state.showGrid = prefs.showGrid;
    if (prefs.animalsFrozen !== undefined)
        state.animalsFrozen = prefs.animalsFrozen;
    if (prefs.ghostVisible !== undefined) state.ghostVisible = prefs.ghostVisible;
}
