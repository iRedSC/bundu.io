import { TILE_SIZE } from "@bundu/shared/tiles";
import type {
    AnimDef,
    AnimPreset,
    ObjectDef,
    OcclusionDef,
    PartDef,
    PartOverride,
    SlotDef,
    StateDef,
    StateOverride,
    StateValue,
    TileGeometry,
    TreeSwayData,
    BobData,
    HitData,
    ContextualVisualDef,
    VisualContext,
    VisualDef,
} from "./types";

type RawDef = Record<string, unknown>;

const ANIM_PRESETS = new Set<AnimPreset>([
    "hurt",
    "hit",
    "weak_hit",
    "place",
    "wave",
    "tree_sway",
    "bob",
    "lunge",
    "attack",
    "block",
    "eat",
    "rotting",
]);
const VISUAL_FILTERS = new Set(["grayscale"]);

function record(value: unknown, path: string): RawDef {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error(`${path}: expected an object`);
    }
    return value as RawDef;
}

function partRecord(value: unknown, path: string): RawDef {
    return value === null ? {} : record(value, path);
}

function string(value: unknown, path: string): string {
    if (typeof value !== "string" || value.length === 0) {
        throw new Error(`${path}: expected a non-empty string`);
    }
    return value;
}

function number(value: unknown, path: string): number {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`${path}: expected a finite number`);
    }
    return value;
}

function boolean(value: unknown, path: string): boolean {
    if (typeof value !== "boolean") throw new Error(`${path}: expected a boolean`);
    return value;
}

function optionalNumber(value: unknown, path: string): number | undefined {
    return value === undefined ? undefined : number(value, path);
}

function optionalBoolean(value: unknown, path: string): boolean | undefined {
    return value === undefined ? undefined : boolean(value, path);
}

function point(value: unknown, path: string): { x: number; y: number } | undefined {
    if (value === undefined) return undefined;
    const raw = record(value, path);
    return { x: number(raw.x, `${path}.x`), y: number(raw.y, `${path}.y`) };
}

function stringList(value: unknown, path: string): string[] {
    if (typeof value === "string") return [string(value, path)];
    if (!Array.isArray(value)) throw new Error(`${path}: expected a string or string array`);
    return value.map((item, index) => string(item, `${path}[${index}]`));
}

function mergeRecords(parent: RawDef, child: RawDef): RawDef {
    const merged: RawDef = { ...parent };
    for (const [key, value] of Object.entries(child)) {
        if (value === null) {
            delete merged[key];
            continue;
        }
        const inherited = merged[key];
        if (
            inherited && typeof inherited === "object" && !Array.isArray(inherited) &&
            value && typeof value === "object" && !Array.isArray(value)
        ) {
            merged[key] = mergeRecords(inherited as RawDef, value as RawDef);
        } else {
            merged[key] = value;
        }
    }
    return merged;
}

function mergeParts(parent: unknown, child: unknown, id: string): RawDef {
    const inherited = parent === undefined ? {} : record(parent, `${id}.parts`);
    const additions = child === undefined ? {} : record(child, `${id}.parts`);
    const merged = { ...inherited };
    for (const [name, value] of Object.entries(additions)) {
        const part = partRecord(value, `${id}.parts.${name}`);
        const baseValue = merged[name];
        const base = baseValue === undefined
            ? undefined
            : partRecord(baseValue, `${id}.parts.${name}`);
        if (base?.parent !== undefined && part.parent !== undefined && base.parent !== part.parent) {
            throw new Error(`${id}.parts.${name}.parent: inherited parts cannot be reparented`);
        }
        merged[name] = base ? mergeRecords(base, part) : part;
    }
    return merged;
}

function array(value: unknown, path: string): unknown[] {
    if (!Array.isArray(value)) throw new Error(`${path}: expected an array`);
    return value;
}

function resolveRawDefs(input: Record<string, unknown>): Map<string, RawDef> {
    const rawById = new Map<string, RawDef>();
    for (const [source, value] of Object.entries(input)) {
        const raw = record(value, source);
        const id = string(raw.id, `${source}.id`);
        if (rawById.has(id)) throw new Error(`${source}.id: duplicate definition "${id}"`);
        rawById.set(id, raw);
    }

    const resolved = new Map<string, RawDef>();
    const resolving = new Set<string>();
    const visit = (id: string): RawDef => {
        const done = resolved.get(id);
        if (done) return done;
        const raw = rawById.get(id);
        if (!raw) throw new Error(`Unknown visual definition "${id}"`);
        if (resolving.has(id)) throw new Error(`${id}.extends: inheritance cycle detected`);
        resolving.add(id);
        const parentId = raw.extends === undefined ? undefined : string(raw.extends, `${id}.extends`);
        const parent = parentId === undefined ? {} : visit(parentId);
        const merged = mergeRecords(parent, raw);
        merged.parts = mergeParts(parent.parts, raw.parts, id);
        merged.id = id;
        // Instantiability is a property of this definition, not its parent.
        merged.abstract = raw.abstract ?? false;
        delete merged.extends;
        resolving.delete(id);
        resolved.set(id, merged);
        return merged;
    };
    for (const id of rawById.keys()) visit(id);
    return resolved;
}

function compilePart(name: string, value: unknown, path: string): PartDef {
    const raw = partRecord(value, path);
    return {
        name,
        sprite: raw.sprite === undefined ? undefined : typeof raw.sprite === "string" ? raw.sprite : string(raw.sprite, `${path}.sprite`),
        parent: raw.parent === undefined ? undefined : string(raw.parent, `${path}.parent`),
        x: optionalNumber(raw.x, `${path}.x`),
        y: optionalNumber(raw.y, `${path}.y`),
        scale: optionalNumber(raw.scale, `${path}.scale`),
        rotation: optionalNumber(raw.rotation, `${path}.rotation`),
        zIndex: optionalNumber(raw.zIndex, `${path}.zIndex`),
        pivot: point(raw.pivot, `${path}.pivot`),
        anchor: point(raw.anchor, `${path}.anchor`),
        spriteScale: optionalNumber(raw.spriteScale, `${path}.spriteScale`),
        attach: optionalBoolean(raw.attach, `${path}.attach`),
        attachAbove: optionalBoolean(raw.attachAbove, `${path}.attachAbove`),
        attachAnchor: point(raw.attachAnchor, `${path}.attachAnchor`),
        alpha: optionalNumber(raw.alpha, `${path}.alpha`),
        visible: optionalBoolean(raw.visible, `${path}.visible`),
    };
}

function compileContext(value: unknown, path: string, defaultTexture?: string): VisualContext {
    const raw = record(value, path);
    const texture = raw.texture === undefined
        ? undefined
        : string(raw.texture, `${path}.texture`);
    const visual = raw.visual === undefined
        ? undefined
        : string(raw.visual, `${path}.visual`);
    if (texture !== undefined && visual !== undefined) {
        throw new Error(`${path}: expected exactly one of texture or visual`);
    }
    const pose = {
        x: optionalNumber(raw.x, `${path}.x`),
        y: optionalNumber(raw.y, `${path}.y`),
        scale: optionalNumber(raw.scale, `${path}.scale`),
        rotation: optionalNumber(raw.rotation, `${path}.rotation`),
        zIndex: optionalNumber(raw.zIndex, `${path}.zIndex`),
        pivot: point(raw.pivot, `${path}.pivot`),
    };
    if (visual !== undefined) return { ...pose, visual };
    const resolvedTexture = texture ?? defaultTexture;
    if (!resolvedTexture) {
        throw new Error(`${path}: expected texture, visual, or a definition texture`);
    }
    return { ...pose, texture: resolvedTexture };
}

function compileContextualDef(raw: RawDef): ContextualVisualDef {
    const id = string(raw.id, "definition.id");
    const defaultTexture = raw.texture === undefined
        ? undefined
        : string(raw.texture, `${id}.texture`);
    const contexts: Record<string, VisualContext> = {};
    for (const [name, value] of Object.entries(record(raw.contexts, `${id}.contexts`))) {
        contexts[name] = compileContext(value, `${id}.contexts.${name}`, defaultTexture);
    }
    if (Object.keys(contexts).length === 0) {
        throw new Error(`${id}.contexts: expected at least one context`);
    }
    return {
        id,
        abstract: raw.abstract === undefined ? false : boolean(raw.abstract, `${id}.abstract`),
        contexts,
    };
}

function compileAnimations(value: unknown, path: string, parts: Set<string>): Record<string, AnimDef> {
    if (value === undefined) return {};
    const rawAnimations = record(value, path);
    const result: Record<string, AnimDef> = {};
    for (const [name, value] of Object.entries(rawAnimations)) {
        const raw = record(value, `${path}.${name}`);
        const preset = string(raw.preset, `${path}.${name}.preset`);
        if (!ANIM_PRESETS.has(preset as AnimPreset)) {
            throw new Error(`${path}.${name}.preset: unknown preset "${preset}"`);
        }
        const targets = stringList(raw.parts, `${path}.${name}.parts`);
        for (const target of targets) {
            if (!parts.has(target)) throw new Error(`${path}.${name}.parts: unknown part "${target}"`);
        }
        result[name] = {
            preset: preset as AnimPreset,
            parts: targets,
            autoplay: optionalBoolean(raw.autoplay, `${path}.${name}.autoplay`),
            data: raw.data === undefined ? undefined : record(raw.data, `${path}.${name}.data`) as TreeSwayData | BobData | HitData,
        } as AnimDef;
    }
    return result;
}

function stateValue(value: unknown, path: string): StateValue {
    if (typeof value !== "boolean" && typeof value !== "number" && typeof value !== "string") {
        throw new Error(`${path}: expected a boolean, number, or string`);
    }
    if (typeof value === "number" && !Number.isFinite(value)) {
        throw new Error(`${path}: expected a finite number`);
    }
    return value;
}

function compilePartOverride(value: unknown, path: string): PartOverride {
    const raw = record(value, path);
    return {
        x: optionalNumber(raw.x, `${path}.x`), y: optionalNumber(raw.y, `${path}.y`),
        scale: optionalNumber(raw.scale, `${path}.scale`), rotation: optionalNumber(raw.rotation, `${path}.rotation`),
        zIndex: optionalNumber(raw.zIndex, `${path}.zIndex`), pivot: point(raw.pivot, `${path}.pivot`),
        alpha: optionalNumber(raw.alpha, `${path}.alpha`), visible: optionalBoolean(raw.visible, `${path}.visible`),
        saturation: optionalNumber(raw.saturation, `${path}.saturation`),
        filters: compileFilters(raw.filters, `${path}.filters`),
    };
}

function compileFilters(value: unknown, path: string): string[] | undefined {
    if (value === undefined) return undefined;
    const filters = stringList(value, path);
    for (const filter of filters) {
        if (!VISUAL_FILTERS.has(filter)) {
            throw new Error(`${path}: unknown filter "${filter}"`);
        }
    }
    return filters;
}

function compileOverride(value: unknown, path: string, parts: Set<string>, animations: Set<string>): StateOverride {
    const raw = record(value, path);
    const result: StateOverride = {};
    if (raw.parts !== undefined) {
        result.parts = {};
        for (const [name, override] of Object.entries(record(raw.parts, `${path}.parts`))) {
            if (!parts.has(name)) throw new Error(`${path}.parts.${name}: unknown part`);
            result.parts[name] = compilePartOverride(override, `${path}.parts.${name}`);
        }
    }
    if (raw.animations !== undefined) {
        result.animations = stringList(raw.animations, `${path}.animations`);
        for (const name of result.animations) {
            if (!animations.has(name)) throw new Error(`${path}.animations: unknown animation "${name}"`);
        }
    }
    return result;
}

function compileStates(value: unknown, path: string, parts: Set<string>, animations: Set<string>): Record<string, StateDef> {
    if (value === undefined) return {};
    const result: Record<string, StateDef> = {};
    for (const [name, state] of Object.entries(record(value, path))) {
        const raw = record(state, `${path}.${name}`);
        const defaultValue = stateValue(raw.default, `${path}.${name}.default`);
        const values = record(raw.values, `${path}.${name}.values`);
        result[name] = { default: defaultValue, values: {} };
        for (const [key, override] of Object.entries(values)) {
            result[name].values[key] = compileOverride(override, `${path}.${name}.values.${key}`, parts, animations);
        }
    }
    return result;
}

function compileOcclusion(
    value: unknown,
    path: string,
    states: ReadonlySet<string>
): OcclusionDef | undefined {
    if (value === undefined) return undefined;
    const raw = record(value, path);
    const state = string(raw.state, `${path}.state`);
    if (!states.has(state)) {
        throw new Error(`${path}.state: unknown state "${state}"`);
    }
    const radius = number(raw.radius, `${path}.radius`);
    if (radius <= 0) throw new Error(`${path}.radius: must be positive`);
    return { state, radius };
}

function compileFootprint(value: unknown, path: string): TileGeometry {
    const raw = record(value, path);
    const rows = array(raw.footprint, `${path}.footprint`).map((row, index) => string(row, `${path}.footprint[${index}]`));
    if (rows.length === 0) throw new Error(`${path}.footprint: expected at least one row`);
    const width = rows[0]?.length ?? 0;
    if (width === 0 || rows.some((row) => row.length !== width)) throw new Error(`${path}.footprint: rows must have equal non-zero width`);
    let origin: { x: number; y: number } | undefined;
    const occupied: { x: number; y: number }[] = [];
    for (const [y, row] of rows.entries()) {
        for (const [x, cell] of [...row].entries()) {
            if (cell !== "." && cell !== "#" && cell !== "X") throw new Error(`${path}.footprint[${y}]: unsupported character "${cell}"`);
            if (cell !== ".") occupied.push({ x, y });
            if (cell === "X") {
                if (origin) throw new Error(`${path}.footprint: expected exactly one X origin`);
                origin = { x, y };
            }
        }
    }
    if (!origin) throw new Error(`${path}.footprint: expected exactly one X origin`);
    const footprintOrigin = origin;
    const spillover = raw.spillover === undefined ? 0 : number(raw.spillover, `${path}.spillover`);
    if (spillover < 0) throw new Error(`${path}.spillover: must be non-negative`);
    return {
        size: { width: width * TILE_SIZE + spillover * 2, height: rows.length * TILE_SIZE + spillover * 2 },
        origin: footprintOrigin,
        spillover,
        footprint: occupied.map(({ x, y }) => ({ x: x - footprintOrigin.x, y: y - footprintOrigin.y })),
    };
}

function compileSlots(value: unknown, path: string, parts: Set<string>): Record<string, SlotDef> | undefined {
    if (value === undefined) return undefined;
    const result: Record<string, SlotDef> = {};
    for (const [name, slot] of Object.entries(record(value, path))) {
        const raw = record(slot, `${path}.${name}`);
        const part = string(raw.part, `${path}.${name}.part`);
        if (!parts.has(part)) throw new Error(`${path}.${name}.part: unknown part "${part}"`);
        const context = string(raw.context, `${path}.${name}.context`);
        result[name] = { part, context, mirrorX: optionalBoolean(raw.mirrorX, `${path}.${name}.mirrorX`), scale: optionalNumber(raw.scale, `${path}.${name}.scale`) };
    }
    return result;
}

function compileVariants(value: unknown, path: string, parts: Set<string>): Record<string, Record<string, string>> {
    const result: Record<string, Record<string, string>> = {};
    for (const [name, variant] of Object.entries(record(value, path))) {
        result[name] = {};
        for (const [part, texture] of Object.entries(record(variant, `${path}.${name}`))) {
            if (!parts.has(part)) throw new Error(`${path}.${name}.${part}: unknown part`);
            result[name][part] = string(texture, `${path}.${name}.${part}`);
        }
    }
    return result;
}

function compileDef(raw: RawDef): VisualDef {
    if (raw.contexts !== undefined) return compileContextualDef(raw);
    const id = string(raw.id, "definition.id");
    const authoredParts = Object.entries(record(raw.parts, `${id}.parts`))
        .map(([name, part]) => compilePart(name, part, `${id}.parts.${name}`));
    const partByName = new Map(authoredParts.map((part) => [part.name, part]));
    const parts: PartDef[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();
    const visitPart = (part: PartDef) => {
        if (visited.has(part.name)) return;
        if (visiting.has(part.name)) throw new Error(`${id}.parts.${part.name}.parent: parent cycle detected`);
        visiting.add(part.name);
        if (part.parent) {
            const parent = partByName.get(part.parent);
            if (!parent) throw new Error(`${id}.parts.${part.name}.parent: unknown part "${part.parent}"`);
            visitPart(parent);
        }
        visiting.delete(part.name);
        visited.add(part.name);
        parts.push(part);
    };
    for (const part of authoredParts) visitPart(part);
    const partNames = new Set(parts.map(({ name }) => name));
    const animations = compileAnimations(raw.animations, `${id}.animations`, partNames);
    const states = compileStates(raw.states, `${id}.states`, partNames, new Set(Object.keys(animations)));
    const stateNames = new Set(Object.keys(states));
    const occlusion = compileOcclusion(raw.occlusion, `${id}.occlusion`, stateNames);
    const alphaFadeMs = optionalNumber(raw.alphaFadeMs, `${id}.alphaFadeMs`);
    if (alphaFadeMs !== undefined && alphaFadeMs < 0) {
        throw new Error(`${id}.alphaFadeMs: must be non-negative`);
    }
    const base: ObjectDef = {
        id,
        abstract: raw.abstract === undefined ? false : boolean(raw.abstract, `${id}.abstract`),
        parts,
        defaultVariant: raw.defaultVariant === undefined ? undefined : string(raw.defaultVariant, `${id}.defaultVariant`),
        variants: raw.variants === undefined ? undefined : compileVariants(raw.variants, `${id}.variants`, partNames),
        slots: compileSlots(raw.slots, `${id}.slots`, partNames),
        animations,
        states,
        stateOrder: Object.keys(states),
        alphaFadeMs,
        occlusion,
    };
    if (raw.tile === undefined) return base;
    const tile = compileFootprint(raw.tile, `${id}.tile`);
    const variants = base.variants ?? {};
    if (!base.abstract && !base.defaultVariant) throw new Error(`${id}.defaultVariant: concrete definitions require a default variant`);
    if (base.defaultVariant && !variants[base.defaultVariant]) throw new Error(`${id}.defaultVariant: unknown variant "${base.defaultVariant}"`);
    return { ...base, tile, variants };
}

export type CompiledVisualDefs = ReadonlyMap<string, VisualDef>;

export function compileVisualDefs(input: Record<string, unknown>): CompiledVisualDefs {
    const flattened = Object.fromEntries(
        Object.entries(input).flatMap(([source, value]) => {
            if (Array.isArray(value)) {
                return value.map((entry, index) => [
                    `${source}[${index}]`,
                    entry,
                ]);
            }
            const raw = record(value, source);
            if ("id" in raw) return [[source, value]];
            return Object.entries(raw).map(([id, definition]) => [
                `${source}.${id}`,
                { id, ...record(definition, `${source}.${id}`) },
            ]);
        })
    );
    const defs = new Map([...resolveRawDefs(flattened)].map(([id, raw]) => [id, compileDef(raw)]));
    for (const def of defs.values()) {
        if (!("contexts" in def)) continue;
        for (const [name, context] of Object.entries(def.contexts)) {
            if (!context.visual) continue;
            const target = defs.get(context.visual);
            if (!target) {
                throw new Error(`${def.id}.contexts.${name}.visual: unknown visual "${context.visual}"`);
            }
            if ("contexts" in target) {
                throw new Error(`${def.id}.contexts.${name}.visual: "${context.visual}" is not an assembled visual`);
            }
        }
    }
    return defs;
}
