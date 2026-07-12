import type { Animation } from "../animation/runtime";
import { attack } from "./animations/attack";
import { block } from "./animations/block";
import { hit, hitRotation } from "./animations/hit";
import { hurt } from "./animations/hurt";
import { treeSway } from "./animations/tree_sway";
import { wave } from "./animations/wave";
import type { AnimContext, AnimDef, PartNode, Rotatable } from "./types";

/** Resolve a preset definition to an Animation. */
export function createPreset(
    def: AnimDef,
    nodes: PartNode[],
    ctx: AnimContext,
    rotationTarget?: Rotatable
): Animation {
    switch (def.preset) {
        case "hurt":
            return hurt(nodes);
        case "hit": {
            if (rotationTarget) return hitRotation(rotationTarget);
            const node = nodes[0];
            if (!node) throw new Error("hit preset needs one part");
            return hit(node);
        }
        case "wave":
            return wave(nodes);
        case "tree_sway":
            return treeSway(nodes, def.data);
        case "attack":
            return attack(nodes, ctx);
        case "block":
            return block(nodes, ctx);
        default:
            throw new Error(`Unknown anim preset: ${def satisfies never}`);
    }
}
