import { Component, GameObject } from "../engine";

export type VisibleObjects = {
    visible: Set<GameObject>;
};
export const VisibleObjects = Component.register<VisibleObjects>(() => {
    return {
        visible: new Set(),
    };
});
