import type { RegistryId } from "@bundu/shared/registry";
import { flagRegistry } from "../flag_registry.js";
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
    /** Resolved flag ids granted while this context applies. */
    flags: number[];
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

function parseFlags(raw: unknown, path: string): number[] {
    if (raw === undefined) return [];
    if (!Array.isArray(raw) || raw.some((entry) => typeof entry !== "string")) {
        throw new Error(`${path}: expected string[]`);
    }
    const registry = flagRegistry();
    const ids: number[] = [];
    const seen = new Set<number>();
    for (const [index, name] of (raw as string[]).entries()) {
        const id = registry.register(name, `${path}[${index}]`);
        if (!seen.has(id)) {
            seen.add(id);
            ids.push(id);
        }
    }
    return ids;
}

function parsePayload(raw: unknown, path: string): EffectPayload {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
        throw new Error(`${path}: expected object`);
    }
    const obj = raw as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
        if (key !== "hide" && key !== "attributes" && key !== "flags") {
            throw new Error(`${path}.${key}: unknown key`);
        }
    }
    return {
        hide: parseHide(obj.hide, `${path}.hide`),
        attributes: parseAttributes(obj.attributes, `${path}.attributes`),
        flags: parseFlags(obj.flags, `${path}.flags`),
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
    if (
        stack === "stack" &&
        (EQUIP_CONTEXTS as readonly string[]).includes(name)
    ) {
        throw new Error(`${path}.stack: equip contexts cannot use stack mode`);
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
    const flags: number[] = [];
    const seen = new Set<number>();
    for (const payload of payloads) {
        hide = orHide(hide, payload.hide);
        attributes = { ...attributes, ...payload.attributes };
        for (const id of payload.flags) {
            if (!seen.has(id)) {
                seen.add(id);
                flags.push(id);
            }
        }
    }
    return { hide, attributes, flags };
}

export function contextHasEffects(context: EffectContext | undefined): boolean {
    if (!context) return false;
    return context.targets.some(
        (t) =>
            t.effects.hide ||
            Object.keys(t.effects.attributes).length > 0 ||
            t.effects.flags.length > 0
    );
}
