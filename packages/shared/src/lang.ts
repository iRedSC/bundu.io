/**
 * Pack language keys and flattening.
 *
 * Authored YAML lives at `assets/<namespace>/lang/<locale>.yml` with nested
 * registry trees (no namespace in the tree). Flattening injects the folder
 * namespace so lookup keys match:
 *
 *   <registry>.<namespace>.<id>.<field>
 *   e.g. item.bundu.wood_pickaxe.name
 *
 * Non-registry roots (e.g. `menu`) flatten without a namespace segment.
 */

import { REGISTRY_NAMES, type RegistryName, type ResourceLocation } from "./registry";

export const LANG_PAYLOAD_FORMAT = 1 as const;

export type LangPayload = {
    format: typeof LANG_PAYLOAD_FORMAT;
    /** Active locale stem (e.g. `en` from `en.yml`). */
    locale: string;
    strings: Record<string, string>;
};

const REGISTRY_ROOTS = new Set<string>(REGISTRY_NAMES);

function record(value: unknown, source: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${source}: expected an object`);
    }
    return value as Record<string, unknown>;
}

/** Build `item.bundu.wood_pickaxe.name` from registry + `bundu:wood_pickaxe` + field. */
export function langKey(
    registry: RegistryName,
    location: ResourceLocation | string,
    field: string
): string {
    const separator = location.indexOf(":");
    if (separator <= 0) {
        throw new Error(`langKey: expected namespace:path, got "${location}"`);
    }
    const namespace = location.slice(0, separator);
    const path = location.slice(separator + 1).replaceAll("/", ".");
    return `${registry}.${namespace}.${path}.${field}`;
}

/** Title-case a resource path for missing-translation fallbacks. */
export function humanizeResourcePath(location: ResourceLocation | string): string {
    const path = location.includes(":")
        ? location.slice(location.indexOf(":") + 1)
        : location;
    return path
        .split(/[/_]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}

function flattenLeaf(
    value: unknown,
    parts: string[],
    out: Record<string, string>,
    source: string
): void {
    if (typeof value === "string") {
        out[parts.join(".")] = value;
        return;
    }
    const node = record(value, `${source}.${parts.join(".")}`);
    for (const [key, child] of Object.entries(node)) {
        flattenLeaf(child, [...parts, key], out, source);
    }
}

/**
 * Flatten one namespace's lang YAML into dotted keys.
 * Registry roots insert `namespace` after the registry segment.
 */
export function flattenLangDocument(
    raw: unknown,
    namespace: string,
    source = "lang"
): Record<string, string> {
    const root = record(raw, source);
    const out: Record<string, string> = {};

    for (const [key, value] of Object.entries(root)) {
        if (REGISTRY_ROOTS.has(key)) {
            const entries = record(value, `${source}.${key}`);
            for (const [id, fields] of Object.entries(entries)) {
                const idPath = id.replaceAll("/", ".");
                if (typeof fields === "string") {
                    out[`${key}.${namespace}.${idPath}`] = fields;
                    continue;
                }
                flattenLeaf(
                    fields,
                    [key, namespace, idPath],
                    out,
                    source
                );
            }
            continue;
        }
        flattenLeaf(value, [key], out, source);
    }

    return out;
}

/** Merge flattened string maps; later entries win. */
export function mergeLangStrings(
    ...maps: readonly Record<string, string>[]
): Record<string, string> {
    return Object.assign({}, ...maps);
}

export function parseLangPayload(raw: unknown, source = "lang payload"): LangPayload {
    const value = record(raw, source);
    if (value.format !== LANG_PAYLOAD_FORMAT) {
        throw new Error(
            `${source}.format: expected ${LANG_PAYLOAD_FORMAT}, got ${String(value.format)}`
        );
    }
    if (typeof value.locale !== "string" || !value.locale) {
        throw new Error(`${source}.locale: expected a non-empty string`);
    }
    const stringsRaw = record(value.strings, `${source}.strings`);
    const strings: Record<string, string> = {};
    for (const [key, text] of Object.entries(stringsRaw)) {
        if (typeof text !== "string") {
            throw new Error(`${source}.strings.${key}: expected a string`);
        }
        strings[key] = text;
    }
    return {
        format: LANG_PAYLOAD_FORMAT,
        locale: value.locale,
        strings,
    };
}
