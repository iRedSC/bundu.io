import type { PartNode } from "../types";

export function limbRoots(nodes: PartNode[]) {
    const left = nodes[0]?.animation;
    const right = nodes[1]?.animation;
    const body = nodes[2]?.animation;
    if (!left || !right || !body) {
        throw new Error("attack/block presets need parts: [leftHand, rightHand, body]");
    }
    return { left, right, body };
}
