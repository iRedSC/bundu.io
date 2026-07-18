import type { Animation } from "../animation/runtime";
import { createPreset } from "./presets";
import {
    EMPTY_ANIM_CONTEXT,
    type AnimContext,
    type ObjectDef,
    type PartNode,
    type HitTarget,
} from "./types";

/** Bind ObjectDef animations to part nodes. Returns id → Animation map. */
export function bindAnimations(
    def: ObjectDef,
    parts: Map<string, PartNode>,
    ctx: AnimContext = EMPTY_ANIM_CONTEXT,
    rotationTarget?: HitTarget
): { animations: Map<string, Animation>; autoplay: string[] } {
    const animations = new Map<string, Animation>();
    const autoplay: string[] = [];

    for (const [name, anim] of Object.entries(def.animations)) {
        const nodes = anim.parts.map((name) => {
            const node = parts.get(name);
            if (!node) {
                throw new Error(
                    `ObjectDef "${def.id}": anim targets unknown part "${name}"`
                );
            }
            return node;
        });

        animations.set(name, createPreset(anim, nodes, ctx, rotationTarget));
        if (anim.autoplay) autoplay.push(name);
    }

    return { animations, autoplay };
}
