import {
    AttributeList,
    Attributes,
    type AttributeType,
    type AttributesData,
} from "../components/attributes.js";
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
import type { Hide } from "../configs/loaders/hide.js";
import { orHide } from "../configs/loaders/hide.js";
import type { GameObject } from "../engine";

const KNOWN = new Set<string>(AttributeList);

/** Deterministic attribute source id for a context contribution. */
export function attributeSourceId(
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
    attrs: Record<string, EffectAttribute>
): void {
    attributes.clear(sourceId);
    for (const [type, attr] of Object.entries(attrs)) {
        if (!KNOWN.has(type) || !attr) continue;
        attributes.set(type as AttributeType, sourceId, attr.op, attr.value);
    }
}

export function clearAttributes(
    attributes: AttributesData | undefined,
    sourceId: string
): void {
    attributes?.clear(sourceId);
}

export function payloadForSubject(
    context: EffectContext,
    subjectMatches: (target: TargetEffect) => boolean
): EffectPayload {
    return mergeMatchingPayloads(matchingPayloads(context, subjectMatches));
}

export function collectHide(payloads: readonly EffectPayload[]): Hide | undefined {
    let hide: Hide | undefined;
    for (const payload of payloads) {
        hide = orHide(hide, payload.hide);
    }
    return hide;
}

/** Apply replace/stack attribute payload from one source object. */
export function applyContextAttributes(
    target: GameObject,
    contextName: string,
    context: EffectContext,
    payload: EffectPayload,
    sourceObjectId?: number
): string | undefined {
    if (Object.keys(payload.attributes).length === 0) return undefined;
    if (context.stack === "max") {
        // Max is aggregated by the spatial system; not applied per-source here.
        return undefined;
    }
    const attributes = Attributes.get(target);
    if (!attributes) return undefined;
    const sourceId = attributeSourceId(
        contextName,
        context.stack,
        sourceObjectId
    );
    applyAttributes(attributes, sourceId, payload.attributes);
    return sourceId;
}

/**
 * Apply max-stack attributes: for each attr type, keep the contributor with the
 * highest value (same op required; mixed ops → last wins by value compare).
 */
export function applyMaxAttributes(
    target: GameObject,
    contextName: string,
    contributions: readonly EffectPayload[]
): string | undefined {
    const merged: Record<string, EffectAttribute> = {};
    for (const payload of contributions) {
        for (const [type, attr] of Object.entries(payload.attributes)) {
            if (!attr) continue;
            const prev = merged[type];
            if (!prev || attr.value > prev.value) {
                merged[type] = attr;
            }
        }
    }
    if (Object.keys(merged).length === 0) {
        clearAttributes(Attributes.get(target), contextName);
        return undefined;
    }
    const attributes = Attributes.get(target);
    if (!attributes) return undefined;
    applyAttributes(attributes, contextName, merged);
    return contextName;
}
