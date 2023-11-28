import { AnimationManager } from "../lib/animation";

type ObjectParts = { [key: string]: any };

interface GameSprite {
    animationManager: AnimationManager<ObjectParts>;
    parts: ObjectParts;
}

interface GameObject {
    id: number;
    lastpos: [number, number, number];
    pos: [number, number];
    nextPos: [number, number, number];
    rotation: number;
    sprite: GameSprite;

    trigger: (event: string) => void;

    move: (pos: [number, number], time: number) => void;
}
