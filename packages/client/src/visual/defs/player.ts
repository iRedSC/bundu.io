import { ANIMATION } from "../../animation/animations";
import type { ObjectDef } from "../types";

/** Player visual definition — limbs, gear slots, combat/idle presets. */
export const playerDef: ObjectDef = {
    id: "player",
    parts: [
        {
            name: "leftHand",
            sprite: "hand",
            scale: 0.5,
            pivot: { x: 1, y: 0 },
            spriteScale: 0.5,
            attach: true,
            zIndex: 0,
        },
        {
            name: "rightHand",
            sprite: "hand",
            scale: 0.5,
            pivot: { x: -1, y: 0 },
            spriteScale: 0.5,
            attach: true,
            attachAnchor: { x: 1, y: 0.5 },
            zIndex: 1,
        },
        {
            name: "body",
            sprite: "player",
            attach: true,
            attachAbove: true,
            zIndex: 2,
        },
        {
            name: "placementGhost",
            sprite: "",
            alpha: 0.5,
            visible: false,
            zIndex: 3,
        },
    ],
    slots: {
        mainhand: { part: "leftHand", display: "hand_display", scale: 5 },
        offhand: {
            part: "rightHand",
            display: "hand_display",
            mirrorX: true,
            scale: 1.8,
        },
        helmet: { part: "body", display: "body_display" },
    },
    animations: [
        {
            id: ANIMATION.IDLE_HANDS,
            preset: "wave",
            parts: ["leftHand", "rightHand", "body"],
            autoplay: true,
        },
        {
            id: ANIMATION.HURT,
            preset: "hurt",
            parts: ["leftHand", "rightHand", "body"],
        },
        {
            id: ANIMATION.ATTACK,
            preset: "attack",
            parts: ["leftHand", "rightHand", "body"],
        },
        {
            id: ANIMATION.BLOCK,
            preset: "block",
            parts: ["leftHand", "rightHand", "body"],
        },
    ],
};
