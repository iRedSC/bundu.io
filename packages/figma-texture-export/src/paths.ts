export const DEFAULT_NAMESPACE = "bundu";
export const COMPANION_PORT = 4177;
export const COMPANION_ORIGIN = `http://127.0.0.1:${COMPANION_PORT}`;

const NAMESPACE_PATTERN = /^[a-z][a-z0-9_]*$/;
const STEM_PATTERN = /^[a-z][a-z0-9_]*$/;
const SEGMENT_PATTERN = /^[a-z][a-z0-9_]*$/;

/** `@item/equipment` → `item/equipment`, or null if invalid. */
export function parseZonePath(name: string): string | null {
    if (!name.startsWith("@") || name === "@") return null;
    const relative = name.slice(1).replace(/^\/+|\/+$/g, "");
    if (!relative || relative.includes("..") || relative.includes("\\")) return null;
    const segments = relative.split("/");
    if (!segments.length || segments.some((segment) => !SEGMENT_PATTERN.test(segment))) return null;
    return segments.join("/");
}

export function isValidNamespace(namespace: string): boolean {
    return NAMESPACE_PATTERN.test(namespace);
}

export function isValidTextureStem(name: string): boolean {
    return STEM_PATTERN.test(name);
}

export function textureRelativePath(zonePath: string, stem: string): string {
    return `${zonePath}/${stem}.svg`;
}

export function texturesRoot(repoRoot: string, namespace: string): string {
    return `${repoRoot}/packs/${namespace}/defs/${namespace}/client/textures`;
}
