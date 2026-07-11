import type { BasicPoint } from "@bundu/shared";

type Drawer = (points: BasicPoint[]) => void;

let drawer: Drawer = () => {};

/** Wired by `mountClientDebug` so prod bundles keep a no-op. */
export function registerAttackHitboxDrawer(fn: Drawer) {
    drawer = fn;
}

/** Draw an ephemeral attack polygon when debug tools are mounted. */
export function debugAttackHitbox(points: BasicPoint[]) {
    drawer(points);
}
