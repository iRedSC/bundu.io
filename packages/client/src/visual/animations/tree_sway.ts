import { radians } from "@bundu/shared/transforms";
import { Animation } from "../../animation/runtime";
import type { PartNode, TreeSwayData } from "../types";

const DISTANCE = 0.1;
const DURATION = 5000;

/** Slow positional drift and subtle tilt for foliage and other scenery. */
export function treeSway(nodes: PartNode[], data: TreeSwayData = {}) {
    const distance = data.distance ?? DISTANCE;
    const tilt = radians(data.tilt ?? 1.5);
    const duration = data.duration ?? DURATION;
    const stagger = data.stagger ?? 0;
    if (duration <= 0) throw new Error("tree_sway duration must be positive");
    const bases = nodes.map(({ root }) => ({
        x: root.x,
        y: root.y,
        rotation: root.rotation,
    }));
    const animation = new Animation();

    animation.keyframes[0] = (a) => {
        if (a.isFirstKeyframe) a.goto(0, duration);

        const phase = a.t * Math.PI * 2;

        for (const [i, node] of nodes.entries()) {
            const base = bases[i];
            if (!base) continue;
            const nodePhase = phase - (i * stagger / duration) * Math.PI * 2;
            node.root.x = base.x + Math.sin(nodePhase) * distance;
            node.root.y =
                base.y + Math.sin(nodePhase * 2) * distance * 0.25;
            node.root.rotation = base.rotation + Math.sin(nodePhase) * tilt;
        }

        if (a.keyframeEnded) a.goto(0, duration);
    };

    animation.cleanup = () => {
        for (const [i, node] of nodes.entries()) {
            const base = bases[i];
            if (!base) continue;
            node.root.x = base.x;
            node.root.y = base.y;
            node.root.rotation = base.rotation;
        }
    };

    return animation;
}
