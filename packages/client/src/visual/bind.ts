import type { Animation } from "../animation/runtime";
import { createPreset } from "./presets";
import {
    EMPTY_ANIM_CONTEXT,
    type AnimContext,
    type ObjectDef,
    type PartNode,
    type Rotatable,
} from "./types";

/** Bind ObjectDef animations to part nodes. Returns id → Animation map. */
export function bindAnimations(
    def: ObjectDef,
    parts: Map<string, PartNode>,
    ctx: AnimContext = EMPTY_ANIM_CONTEXT,
    rotationTarget?: Rotatable
): { animations: Map<number, Animation>; autoplay: number[] } {
    const animations = new Map<number, Animation>();
    const autoplay: number[] = [];

    for (const anim of def.animations ?? []) {
        const nodes = anim.parts.map((name) => {
            const node = parts.get(name);
            if (!node) {
                throw new Error(
                    `ObjectDef "${def.id}": anim targets unknown part "${name}"`
                );
            }
            return node;
        });

        animations.set(
            anim.id,
            createPreset(anim, nodes, ctx, rotationTarget)
        );
        if (anim.autoplay) autoplay.push(anim.id);
    }

    return { animations, autoplay };
}
