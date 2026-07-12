import type { PartNode } from "../types";

export function limbRoots(nodes: PartNode[]) {
    const left = nodes[0]?.root;
    const right = nodes[1]?.root;
    const body = nodes[2]?.root;
    if (!left || !right || !body) {
        throw new Error("attack/block presets need parts: [leftHand, rightHand, body]");
    }
    return { left, right, body };
}
