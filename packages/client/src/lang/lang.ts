/**
 * Client language store — filled from pack `lang.json`.
 */

import {
    humanizeResourcePath,
    langKey,
    parseLangPayload,
    type LangPayload,
} from "@bundu/shared/lang";
import type { RegistryName, ResourceLocation } from "@bundu/shared/registry";

let locale = "en";
let strings: Record<string, string> = {};

export function applyLang(raw: unknown): LangPayload {
    const payload = parseLangPayload(raw);
    locale = payload.locale;
    strings = payload.strings;
    return payload;
}

export function getLocale(): string {
    return locale;
}

/** Look up a flat key; returns undefined when missing. */
export function tOptional(key: string): string | undefined {
    const value = strings[key];
    return value === undefined || value === "" ? undefined : value;
}

/** Look up a flat key; falls back to the key itself. */
export function t(key: string): string {
    return tOptional(key) ?? key;
}

/** Registry entry field (`name`, `desc`, …) with humanized path fallback for names. */
export function translateEntry(
    registry: RegistryName,
    location: ResourceLocation | string,
    field: string
): string {
    const key = langKey(registry, location, field);
    const value = tOptional(key);
    if (value !== undefined) return value;
    if (field === "name") return humanizeResourcePath(location);
    return "";
}

export type TooltipCopy = {
    title: string;
    body?: string;
    /** Extra line under the body (e.g. interaction hint). */
    footer?: string;
};

export function tooltipCopy(
    registry: RegistryName,
    location: ResourceLocation | string
): TooltipCopy {
    const title = translateEntry(registry, location, "name");
    const body = translateEntry(registry, location, "desc");
    return body ? { title, body } : { title };
}
