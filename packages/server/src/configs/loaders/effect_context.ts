import type { RegistryId } from "@bundu/shared/registry";
import type { GameRegistries } from "../registries.js";
import { type Hide, orHide, parseHide } from "./hide.js";

export type StackMode = "replace" | "stack" | "max";
export type OccupationType = "center" | "collider";

export type EffectAttribute = {
    op: "add" | "multiply";
    value: number;
};

export type EffectPayload = {
    hide?: Hide;
    /** Known keys apply at runtime; unknown keys are kept for forward-compat. */
    attributes: Record<string, EffectAttribute>;
};

/** One target selector entry after load (`*` or resolved entity types). */
export type TargetEffect = {
    /** When true, matches every subject. */
    all: boolean;
    /** Resolved entity_type ids when `all` is false. */
    types: ReadonlySet<RegistryId<"entity_type">>;
    effects: EffectPayload;
};

export type EffectContext = {
    stack: StackMode;
    /** Range in decitiles (= world units). Only for whenNearby. */
    proximityDistance?: number;
    occupationType?: OccupationType;
    targets: readonly TargetEffect[];
};

export type EquipContextName = "whenMainHand" | "whenOffHand" | "whenHelmet";
export type SpatialContextName = "whenOccupied" | "whenNearby";
export type ContextName = EquipContextName | SpatialContextName;

export const EQUIP_CONTEXTS = [
    "whenMainHand",
    "whenOffHand",
    "whenHelmet",
] as const satisfies readonly EquipContextName[];

export const SPATIAL_CONTEXTS = [
    "whenOccupied",
    "whenNearby",
] as const satisfies readonly SpatialContextName[];

const RESERVED = new Set(["stack", "proximityDistance", "occupationType"]);
const STACK_MODES = new Set<StackMode>(["replace", "stack", "max"]);
const OCCUPATION_TYPES = new Set<OccupationType>(["center", "collider"]);
const ATTR_OPS = new Set(["add", "multiply"]);

export type ContextBundle = {
    whenMainHand?: EffectContext;
    whenOffHand?: EffectContext;
    whenHelmet?: EffectContext;
    whenOccupied?: EffectContext;
    whenNearby?: EffectContext;
};

function namespace(id: string): string {
    return id.slice(0, id.indexOf(":"));
}

function parseAttributes(
    raw: unknown,
    path: string
): Record<string, EffectAttribute> {
    if (raw === undefined) return {};
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error(`${path}: expected object`);
    }
    const result: Record<string, EffectAttribute> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
            throw new Error(`${path}.${key}: expected { op, value }`);
        }
        const op = (value as { op?: unknown }).op;
        const num = (value as { value?: unknown }).value;
        if (typeof op !== "string" || !ATTR_OPS.has(op)) {
            throw new Error(`${path}.${key}.op: expected add|multiply`);
        }
        if (typeof num !== "number" || !Number.isFinite(num)) {
            throw new Error(`${path}.${key}.value: expected number`);
        }
        result[key] = { op: op as "add" | "multiply", value: num };
    }
    return result;
}

function parsePayload(raw: unknown, path: string): EffectPayload {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error(`${path}: expected object`);
    }
    const obj = raw as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
        if (key !== "hide" && key !== "attributes") {
            throw new Error(`${path}.${key}: unknown key`);
        }
    }
    return {
        hide: parseHide(obj.hide, `${path}.hide`),
        attributes: parseAttributes(obj.attributes, `${path}.attributes`),
    };
}

function defaultStack(name: ContextName): StackMode {
    if (name === "whenNearby" || name === "whenOccupied") return "stack";
    return "replace";
}

/**
 * Parse a when* block:
 * ```
 * whenNearby:
 *   stack: max
 *   proximityDistance: 200
 *   "*":
 *     attributes: ...
 *   player:
 *     hide: ...
 * ```
 */
export function parseEffectContext(
    raw: unknown,
    path: string,
    name: ContextName,
    registries: GameRegistries,
    ownerId: string
): EffectContext | undefined {
    if (raw === undefined) return undefined;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error(`${path}: expected object`);
    }
    const obj = raw as Record<string, unknown>;

    let stack = defaultStack(name);
    if (obj.stack !== undefined) {
        if (typeof obj.stack !== "string" || !STACK_MODES.has(obj.stack as StackMode)) {
            throw new Error(`${path}.stack: expected replace|stack|max`);
        }
        stack = obj.stack as StackMode;
    }

    let proximityDistance: number | undefined;
    if (obj.proximityDistance !== undefined) {
        if (name !== "whenNearby") {
            throw new Error(`${path}.proximityDistance: only valid on whenNearby`);
        }
        if (
            typeof obj.proximityDistance !== "number" ||
            !Number.isFinite(obj.proximityDistance) ||
            obj.proximityDistance <= 0
        ) {
            throw new Error(`${path}.proximityDistance: expected positive number`);
        }
        proximityDistance = obj.proximityDistance;
    }

    let occupationType: OccupationType | undefined;
    if (obj.occupationType !== undefined) {
        if (name !== "whenOccupied") {
            throw new Error(`${path}.occupationType: only valid on whenOccupied`);
        }
        if (
            typeof obj.occupationType !== "string" ||
            !OCCUPATION_TYPES.has(obj.occupationType as OccupationType)
        ) {
            throw new Error(`${path}.occupationType: expected center|collider`);
        }
        occupationType = obj.occupationType as OccupationType;
    }

    const targets: TargetEffect[] = [];
    for (const [key, value] of Object.entries(obj)) {
        if (RESERVED.has(key)) continue;
        const payload = parsePayload(value, `${path}.${key}`);
        if (key === "*") {
            targets.push({ all: true, types: new Set(), effects: payload });
            continue;
        }
        const ids = registries.entity_type.resolveSet(
            [key],
            namespace(ownerId),
            `${path}.${key}`
        );
        targets.push({
            all: false,
            types: new Set(ids),
            effects: payload,
        });
    }

    if (
        targets.length === 0 &&
        proximityDistance === undefined &&
        occupationType === undefined &&
        obj.stack === undefined
    ) {
        return undefined;
    }

    if (name === "whenNearby" && proximityDistance === undefined) {
        throw new Error(`${path}: whenNearby requires proximityDistance`);
    }
    if (name === "whenOccupied" && occupationType === undefined) {
        occupationType = "center";
    }

    return {
        stack,
        proximityDistance,
        occupationType,
        targets,
    };
}

function mergePayload(base: EffectPayload, override: EffectPayload): EffectPayload {
    return {
        hide: override.hide ?? base.hide,
        attributes: {
            ...base.attributes,
            ...override.attributes,
        },
    };
}

/** Merge type → instance contexts (instance wins on reserved fields; targets by selector key). */
export function mergeEffectContext(
    base: EffectContext | undefined,
    override: EffectContext | undefined
): EffectContext | undefined {
    if (!base) return override;
    if (!override) return base;

    // Rebuild via selector identity: all → "*", else sorted type ids joined.
    const map = new Map<string, TargetEffect>();
    const keyOf = (t: TargetEffect) =>
        t.all ? "*" : [...t.types].sort((a, b) => a - b).join(",");

    for (const t of base.targets) map.set(keyOf(t), t);
    for (const t of override.targets) {
        const key = keyOf(t);
        const prev = map.get(key);
        map.set(
            key,
            prev
                ? {
                      all: t.all,
                      types: t.types,
                      effects: mergePayload(prev.effects, t.effects),
                  }
                : t
        );
    }

    return {
        stack: override.stack,
        proximityDistance: override.proximityDistance ?? base.proximityDistance,
        occupationType: override.occupationType ?? base.occupationType,
        targets: [...map.values()],
    };
}

export function mergeContextBundle(
    base: ContextBundle,
    override: ContextBundle
): ContextBundle {
    return {
        whenMainHand: mergeEffectContext(base.whenMainHand, override.whenMainHand),
        whenOffHand: mergeEffectContext(base.whenOffHand, override.whenOffHand),
        whenHelmet: mergeEffectContext(base.whenHelmet, override.whenHelmet),
        whenOccupied: mergeEffectContext(base.whenOccupied, override.whenOccupied),
        whenNearby: mergeEffectContext(base.whenNearby, override.whenNearby),
    };
}

export function parseContextBundle(
    raw: Record<string, unknown>,
    path: string,
    registries: GameRegistries,
    ownerId: string,
    allowed: readonly ContextName[]
): ContextBundle {
    const allowedSet = new Set<string>(allowed);
    const result: ContextBundle = {};
    for (const name of allowed) {
        if (raw[name] === undefined) continue;
        result[name] = parseEffectContext(
            raw[name],
            `${path}.${name}`,
            name,
            registries,
            ownerId
        );
    }
    for (const key of Object.keys(raw)) {
        if (
            (EQUIP_CONTEXTS as readonly string[]).includes(key) ||
            (SPATIAL_CONTEXTS as readonly string[]).includes(key)
        ) {
            if (!allowedSet.has(key)) {
                throw new Error(`${path}.${key}: not allowed here`);
            }
        }
    }
    return result;
}

/** Collect payloads from every matching target entry (all matches apply). */
export function matchingPayloads(
    context: EffectContext,
    matches: (target: TargetEffect) => boolean
): EffectPayload[] {
    return context.targets.filter(matches).map((t) => t.effects);
}

export function mergeMatchingPayloads(payloads: readonly EffectPayload[]): EffectPayload {
    let hide: Hide | undefined;
    let attributes: Record<string, EffectAttribute> = {};
    for (const payload of payloads) {
        hide = orHide(hide, payload.hide);
        attributes = { ...attributes, ...payload.attributes };
    }
    return { hide, attributes };
}

export function contextHasEffects(context: EffectContext | undefined): boolean {
    if (!context) return false;
    return context.targets.some(
        (t) => t.effects.hide || Object.keys(t.effects.attributes).length > 0
    );
}
