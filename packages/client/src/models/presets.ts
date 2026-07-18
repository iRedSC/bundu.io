import type { Animation } from "../animation/runtime";
import { attack } from "./animations/attack";
import { block } from "./animations/block";
import { eat } from "./animations/eat";
import { bob } from "./animations/bob";
import { hit, hitRotation } from "./animations/hit";
import { hurt } from "./animations/hurt";
import { lunge } from "./animations/lunge";
import { place } from "./animations/place";
import { fireGlowAnim } from "./animations/fire_glow";
import { rotting } from "./animations/rotting";
import { spikeAttack } from "./animations/spike_attack";
import { treeSway } from "./animations/tree_sway";
import { wave } from "./animations/wave";
import type { AnimContext, AnimDef, HitTarget, PartNode } from "./types";

/** Resolve a preset definition to an Animation. */
export function createPreset(
    def: AnimDef,
    nodes: PartNode[],
    ctx: AnimContext,
    rotationTarget?: HitTarget
): Animation {
    switch (def.preset) {
        case "hurt":
            return hurt(nodes);
        case "hit": {
            if (rotationTarget) {
                // Bound preset is a no-angle fallback; CombatFx plays parameterized hits.
                return hitRotation(rotationTarget, {
                    angle: 0,
                    kickDegrees: def.data?.kick ?? 14,
                    knockback: 0,
                });
            }
            const node = nodes[0];
            if (!node) throw new Error("hit preset needs one part");
            return hit(node);
        }
        case "place": {
            const node = nodes[0];
            if (!node) throw new Error("place preset needs one part");
            return place(node);
        }
        case "wave":
            return wave(nodes);
        case "tree_sway":
            return treeSway(nodes, def.data);
        case "bob":
            return bob(nodes, def.data);
        case "lunge":
            return lunge(nodes);
        case "attack":
            return attack(nodes, ctx);
        case "spike_attack": {
            const node = nodes[0];
            if (!node) throw new Error("spike_attack preset needs one part");
            return spikeAttack(node);
        }
        case "block":
            return block(nodes, ctx);
        case "eat":
            return eat(nodes, ctx);
        case "rotting":
            return rotting(nodes, ctx);
        case "fire_glow":
            return fireGlowAnim(nodes, ctx);
        default:
            throw new Error(`Unknown anim preset: ${def satisfies never}`);
    }
}
