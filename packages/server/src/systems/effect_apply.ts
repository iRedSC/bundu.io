import {
    Attributes,
    isAttributeType,
    type AttributeType,
    type AttributesData,
} from "../components/attributes.js";
import { Flags, type FlagsData } from "../components/flags.js";
import type {
    EffectAttribute,
    EffectContext,
    EffectPayload,
    StackMode,
    TargetEffect,
} from "../configs/loaders/effect_context.js";
import {
    mergeMatchingPayloads,
    matchingPayloads,
} from "../configs/loaders/effect_context.js";
import type { GameObject } from "../engine";

/** Deterministic source id for a context contribution. */
export function effectSourceId(
    contextName: string,
    stack: StackMode,
    sourceObjectId: number | undefined
): string {
    if (stack === "stack") {
        if (sourceObjectId === undefined) {
            throw new Error(`${contextName}: stack mode requires source object id`);
        }
        return `${contextName}:${sourceObjectId}`;
    }
    // replace + max share one slot per context name (max recomputes the value).
    return contextName;
}

export function applyAttributes(
    attributes: AttributesData,
    sourceId: string,
    attrs: Partial<Record<AttributeType, EffectAttribute>> | Record<string, EffectAttribute>
): void {
    const next: Partial<
        Record<AttributeType, { operation: EffectAttribute["op"]; value: number }>
    > = {};
    for (const [type, attr] of Object.entries(attrs)) {
        if (!attr || !isAttributeType(type)) continue;
        next[type] = { operation: attr.op, value: attr.value };
    }
    attributes.replace(sourceId, next);
}

export function clearAttributes(
    attributes: AttributesData | undefined,
    sourceId: string
): void {
    attributes?.clear(sourceId);
}

export function applyFlags(
    flags: FlagsData,
    sourceId: string,
    flagIds: readonly number[]
): boolean {
    return flags.setSource(sourceId, flagIds);
}

export function clearFlags(
    flags: FlagsData | undefined,
    sourceId: string
): boolean {
    return flags?.clear(sourceId) ?? false;
}

export function payloadForSubject(
    context: EffectContext,
    subjectMatches: (target: TargetEffect) => boolean
): EffectPayload {
    return mergeMatchingPayloads(matchingPayloads(context, subjectMatches));
}

export function payloadIsEmpty(payload: EffectPayload): boolean {
    return (
        !payload.hide &&
        Object.keys(payload.attributes).length === 0 &&
        payload.flags.length === 0
    );
}

/**
 * Apply replace/stack attrs + flags from one source object.
 * Returns the source id if anything was applied (or cleared into place).
 */
export function applyContextEffects(
    target: GameObject,
    contextName: string,
    context: EffectContext,
    payload: EffectPayload,
    sourceObjectId?: number
): string | undefined {
    if (context.stack === "max") {
        // Max is aggregated by the spatial system; not applied per-source here.
        return undefined;
    }
    const sourceId = effectSourceId(
        contextName,
        context.stack,
        sourceObjectId
    );
    const attributes = Attributes.get(target);
    if (attributes) {
        if (Object.keys(payload.attributes).length === 0) {
            clearAttributes(attributes, sourceId);
        } else {
            applyAttributes(attributes, sourceId, payload.attributes);
        }
    }
    const flags = Flags.get(target);
    if (flags) {
        applyFlags(flags, sourceId, payload.flags);
    }
    return sourceId;
}

/**
 * Apply max-stack attributes + union flags under one context source id.
 */
export function applyMaxEffects(
    target: GameObject,
    contextName: string,
    contributions: readonly EffectPayload[]
): string | undefined {
    const merged: Partial<Record<AttributeType, EffectAttribute>> = {};
    const flagSet = new Set<number>();
    for (const payload of contributions) {
        for (const [type, attr] of Object.entries(payload.attributes)) {
            if (!attr || !isAttributeType(type)) continue;
            const prev = merged[type];
            if (!prev || attr.value > prev.value) {
                merged[type] = attr;
            }
        }
        for (const id of payload.flags) flagSet.add(id);
    }

    const attributes = Attributes.get(target);
    const flags = Flags.get(target);
    const flagIds = [...flagSet];

    if (Object.keys(merged).length === 0) {
        clearAttributes(attributes, contextName);
    } else if (attributes) {
        applyAttributes(attributes, contextName, merged);
    }

    if (flagIds.length === 0) {
        clearFlags(flags, contextName);
    } else if (flags) {
        applyFlags(flags, contextName, flagIds);
    }

    if (Object.keys(merged).length === 0 && flagIds.length === 0) {
        return undefined;
    }
    return contextName;
}

export function clearContextSource(
    target: GameObject,
    sourceId: string
): void {
    clearAttributes(Attributes.get(target), sourceId);
    clearFlags(Flags.get(target), sourceId);
}
