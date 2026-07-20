/**
 * Path-based model identity: `kind:namespace:path`
 *
 * Parallel to gameplay registries, but models can also use `item_type` (item
 * visual templates) and `model` (shared visual abstracts like wall/animal).
 */

export const MODEL_KINDS = [
    "item",
    "item_type",
    "structure",
    "resource",
    "decoration",
    "entity_type",
    "model",
] as const;

export type ModelKind = (typeof MODEL_KINDS)[number];

export type ModelIdParts = {
    kind: ModelKind;
    namespace: string;
    path: string;
};

export function isModelKind(value: string): value is ModelKind {
    return (MODEL_KINDS as readonly string[]).includes(value);
}

/** Build `kind:namespace:path`. */
export function modelId(
    kind: ModelKind,
    namespace: string,
    path: string
): string {
    if (!namespace || !path) {
        throw new Error(`modelId: expected namespace and path`);
    }
    if (path.includes(":")) {
        throw new Error(`modelId: path must not contain ":": ${path}`);
    }
    return `${kind}:${namespace}:${path}`;
}

/**
 * Gameplay registry location (`bundu:bear` or bare `bear`) → model id.
 * Bare paths default to namespace `bundu`.
 */
export function modelIdForLocation(kind: ModelKind, location: string): string {
    const index = location.indexOf(":");
    if (index === -1) return modelId(kind, "bundu", location);
    const namespace = location.slice(0, index);
    const path = location.slice(index + 1);
    if (!namespace || !path || path.includes(":")) {
        throw new Error(`modelIdForLocation: invalid location "${location}"`);
    }
    return modelId(kind, namespace, path);
}

export function parseModelId(id: string): ModelIdParts | null {
    const first = id.indexOf(":");
    if (first === -1) return null;
    const second = id.indexOf(":", first + 1);
    if (second === -1) return null;
    const kind = id.slice(0, first);
    const namespace = id.slice(first + 1, second);
    const path = id.slice(second + 1);
    if (!isModelKind(kind) || !namespace || !path) return null;
    return { kind, namespace, path };
}

/**
 * Derive a model id from an assets-relative models path.
 * `models/items/wood_sword.yml` → `item:bundu:wood_sword`
 * `models/items/type/sword.yml` → `item_type:bundu:sword`
 *
 * Abstract defs under structure/entity folders map to `model:` instead of the
 * gameplay-parallel kind.
 */
export function modelIdFromModelsPath(
    namespace: string,
    relativePath: string,
    options?: { abstract?: boolean }
): string {
    const stem = relativePath.replace(/\.ya?ml$/i, "").replaceAll("\\", "/");
    const abstract = options?.abstract === true;

    if (stem.startsWith("items/type/")) {
        return modelId("item_type", namespace, stem.slice("items/type/".length));
    }
    if (stem.startsWith("items/")) {
        return modelId("item", namespace, stem.slice("items/".length));
    }
    if (stem.startsWith("decorations/")) {
        return modelId("decoration", namespace, stem.slice("decorations/".length));
    }
    if (stem.startsWith("resources/")) {
        return modelId("resource", namespace, stem.slice("resources/".length));
    }
    if (stem.startsWith("corpses/")) {
        const path = stem.slice("corpses/".length);
        return modelId(abstract ? "model" : "resource", namespace, path);
    }
    if (stem.startsWith("actors/")) {
        const path = stem.slice("actors/".length);
        return modelId(abstract ? "model" : "entity_type", namespace, path);
    }
    if (
        stem.startsWith("walls/") ||
        stem.startsWith("doors/") ||
        stem.startsWith("structures/")
    ) {
        const path = stem.slice(stem.indexOf("/") + 1);
        return modelId(abstract ? "model" : "structure", namespace, path);
    }
    if (stem.startsWith("base/")) {
        return modelId("model", namespace, stem.slice("base/".length));
    }
    if (stem.startsWith("nature/")) {
        // Odd paths (e.g. nature/tree.yml → forest_tree) need an explicit id.
        return modelId("model", namespace, stem.slice("nature/".length));
    }
    return modelId("model", namespace, stem);
}
