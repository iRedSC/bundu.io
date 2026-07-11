import { ANIMATION } from "../../animation/animations";
import type { ObjectDef } from "../types";

/** Single-sprite tile entity def (walls, trees, fire pit, …). */
export function structureDef(type: string): ObjectDef {
    return {
        id: type,
        parts: [
            {
                name: "main",
                sprite: type,
            },
        ],
        animations: [
            {
                id: ANIMATION.HURT,
                preset: "hit",
                parts: ["main"],
            },
        ],
    };
}
