const PACK_TEXTURE_EXT = /\.(svg|png|jpe?g|webp|avif|gif)$/i;

/** True when a string looks like a pack texture logical path. */
export function isPackTexturePath(value: string): boolean {
    return PACK_TEXTURE_EXT.test(value) && value.includes("/");
}

/** Normalize authored texture paths to the sanitized PNG logical path. */
export function toSanitizedTexturePath(path: string): string {
    return path.replace(PACK_TEXTURE_EXT, ".png");
}

/** Rewrite pack texture path strings inside visual definition documents. */
export function rewritePackTextureRefs<T>(value: T): T {
    if (typeof value === "string") {
        return (isPackTexturePath(value)
            ? toSanitizedTexturePath(value)
            : value) as T;
    }
    if (Array.isArray(value)) {
        return value.map((entry) => rewritePackTextureRefs(entry)) as T;
    }
    if (value && typeof value === "object") {
        return Object.fromEntries(
            Object.entries(value).map(([key, entry]) => [
                key,
                rewritePackTextureRefs(entry),
            ])
        ) as T;
    }
    return value;
}
