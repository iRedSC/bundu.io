import { lerp, radians } from "@bundu/shared/transforms";
import type {
    EntityStateSnapshot,
    EntityStateValue,
} from "@bundu/shared/object_types";
import { ColorMatrixFilter } from "pixi.js";
import type { Animation, AnimationManager } from "../animation/runtime";
import type {
    ObjectDef,
    PartNode,
    PartOverride,
} from "./types";

export class EntityStateStore {
    private readonly values = new Map<string, EntityStateValue>();
    private readonly listeners = new Set<() => void>();

    constructor(initial: EntityStateSnapshot = {}) {
        for (const [name, value] of Object.entries(initial)) {
            this.values.set(name, value);
        }
    }

    get(name: string): EntityStateValue | undefined {
        return this.values.get(name);
    }

    set(name: string, value: EntityStateValue): void {
        if (this.values.get(name) === value) return;
        this.values.set(name, value);
        for (const listener of this.listeners) listener();
    }

    snapshot(): ReadonlyMap<string, EntityStateValue> {
        return new Map(this.values);
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }
}

type AnimationSource = {
    active?: boolean;
    renderable?: boolean;
    visible?: boolean;
};

type AlphaTween = {
    from: number;
    to: number;
    startedAt: number;
};

/** Resolves persistent visual state and owns animations requested by that state. */
export class VisualStateController {
    private readonly activeAnimations = new Set<string>();
    private readonly alphaTweens = new Map<string, AlphaTween>();
    private readonly unsubscribe: () => void;
    private time = 0;
    private primed = false;

    constructor(
        private readonly def: ObjectDef,
        private readonly parts: ReadonlyMap<string, PartNode>,
        private readonly animations: ReadonlyMap<string, Animation>,
        private readonly states: EntityStateStore,
        private readonly animationManager: AnimationManager,
        private readonly animationSource: AnimationSource
    ) {
        this.unsubscribe = states.subscribe(() => this.resolve());
        this.resolve();
    }

    resolve(): void {
        const overrides = new Map<string, PartOverride>();
        const desiredAnimations = new Set<string>();

        for (const stateName of this.def.stateOrder) {
            const state = this.def.states[stateName];
            if (!state) continue;
            const value = this.states.get(stateName) ?? state.default;
            const override = state.values[String(value)];
            if (!override) continue;

            for (const [partName, patch] of Object.entries(
                override.parts ?? {}
            )) {
                overrides.set(
                    partName,
                    mergePartOverride(overrides.get(partName), patch)
                );
            }
            for (const animation of override.animations ?? []) {
                desiredAnimations.add(animation);
            }
        }

        const fadeMs = this.primed ? (this.def.alphaFadeMs ?? 0) : 0;
        for (const [name, node] of this.parts) {
            const override = overrides.get(name);
            applyPartOverride(node, override, fadeMs > 0);
            if (fadeMs > 0) this.retargetAlpha(name, node, override);
        }
        this.syncAnimations(desiredAnimations);
        this.primed = true;
    }

    /** Advance part alpha fades. */
    tick(time: number): void {
        this.time = time;
        const fadeMs = this.def.alphaFadeMs ?? 0;
        if (fadeMs <= 0 || this.alphaTweens.size === 0) return;

        for (const [name, tween] of this.alphaTweens) {
            const node = this.parts.get(name);
            if (!node) {
                this.alphaTweens.delete(name);
                continue;
            }
            const t = Math.min(1, (time - tween.startedAt) / fadeMs);
            node.state.alpha = lerp(tween.from, tween.to, t);
            if (t >= 1) this.alphaTweens.delete(name);
        }
    }

    dispose(): void {
        this.unsubscribe();
        this.alphaTweens.clear();
        for (const name of this.activeAnimations) {
            this.animationManager.remove(this.animationSource, name);
        }
        this.activeAnimations.clear();
        for (const node of this.parts.values()) applyPartOverride(node);
    }

    private retargetAlpha(
        name: string,
        node: PartNode,
        override?: PartOverride
    ): void {
        const base = ensureBase(node);
        const target = override?.alpha ?? base.alpha;
        const existing = this.alphaTweens.get(name);
        if (existing?.to === target) return;
        if (node.state.alpha === target) {
            this.alphaTweens.delete(name);
            return;
        }
        this.alphaTweens.set(name, {
            from: node.state.alpha,
            to: target,
            startedAt: this.time,
        });
    }

    private syncAnimations(desired: ReadonlySet<string>): void {
        for (const name of this.activeAnimations) {
            if (!desired.has(name)) {
                this.animationManager.remove(this.animationSource, name);
                this.activeAnimations.delete(name);
            }
        }
        for (const name of desired) {
            if (this.activeAnimations.has(name)) continue;
            const animation = this.animations.get(name);
            if (!animation) {
                throw new Error(
                    `ObjectDef "${this.def.id}": state references unknown animation "${name}"`
                );
            }
            this.animationManager.set(
                this.animationSource,
                name,
                animation.run()
            );
            this.activeAnimations.add(name);
        }
    }
}

function mergePartOverride(
    current: PartOverride | undefined,
    patch: PartOverride
): PartOverride {
    const merged: PartOverride = { ...current };
    for (const [key, value] of Object.entries(patch) as [
        keyof PartOverride,
        PartOverride[keyof PartOverride],
    ][]) {
        // Compiled overrides include absent fields as undefined; spreading those
        // would wipe values from earlier states (e.g. spiked after open).
        if (key === "filters") continue;
        if (value !== undefined) {
            Object.assign(merged, { [key]: value });
        }
    }
    merged.filters = mergeFilters(current?.filters, patch.filters);
    return merged;
}

function mergeFilters(
    current: readonly string[] | undefined,
    next: readonly string[] | undefined
): string[] | undefined {
    if (!next) return current ? [...current] : undefined;
    return [...new Set([...(current ?? []), ...next])];
}

type BasePartState = {
    x: number;
    y: number;
    scale: number;
    rotation: number;
    pivot: { x: number; y: number };
    alpha: number;
    visible: boolean;
    zIndex: number;
};

const stateFilters = new WeakMap<PartNode, ColorMatrixFilter[]>();
const baseStates = new WeakMap<PartNode, BasePartState>();

function ensureBase(node: PartNode): BasePartState {
    const state = node.state;
    const animation = node.animation;
    const existing = baseStates.get(node);
    if (existing) return existing;
    const base: BasePartState = {
        x: state.x,
        y: state.y,
        scale: state.scale.x,
        rotation: state.rotation,
        pivot: { x: animation.pivot.x, y: animation.pivot.y },
        alpha: state.alpha,
        visible: state.visible,
        zIndex: node.root.zIndex,
    };
    baseStates.set(node, base);
    return base;
}

function applyPartOverride(
    node: PartNode,
    override?: PartOverride,
    deferAlpha = false
): void {
    const state = node.state;
    const animation = node.animation;
    const base = ensureBase(node);
    node.root.zIndex = override?.zIndex ?? base.zIndex;
    state.position.set(override?.x ?? base.x, override?.y ?? base.y);
    state.scale.set(override?.scale ?? base.scale);
    state.rotation =
        override?.rotation === undefined
            ? base.rotation
            : radians(override.rotation);
    animation.pivot.set(
        override?.pivot?.x ?? base.pivot.x,
        override?.pivot?.y ?? base.pivot.y
    );
    if (!deferAlpha) state.alpha = override?.alpha ?? base.alpha;
    state.visible = override?.visible ?? base.visible;
    for (const filter of stateFilters.get(node) ?? []) filter.destroy();
    const filters = (override?.filters ?? []).map(createFilter);
    if (override?.saturation !== undefined) {
        filters.push(createSaturationFilter(override.saturation));
    }
    stateFilters.set(node, filters);
    state.filters = filters;
}

function createFilter(name: string): ColorMatrixFilter {
    if (name !== "grayscale") throw new Error(`Unknown visual filter "${name}"`);
    const filter = new ColorMatrixFilter();
    filter.greyscale(1, false);
    return filter;
}

/** Authored 1 = unchanged, 0 = fully desaturated (Pixi saturate is -1..1 around 0). */
function createSaturationFilter(saturation: number): ColorMatrixFilter {
    const filter = new ColorMatrixFilter();
    filter.saturate(saturation - 1, false);
    return filter;
}
