import { Component, GameObject } from "@ioengine/server";

export type VisibleObjects = {
    visible: Set<GameObject>;
};
export const VisibleObjects = Component.register<VisibleObjects>(() => {
    return {
        visible: new Set(),
    };
});
