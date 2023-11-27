import { Animation, AnimationManager } from "../../lib/animation";

type ObjectParts = { [key: string]: any };

interface GameSprite {
    animations: Map<string, Animation<ObjectParts>>;
    animationManager: AnimationManager<ObjectParts>;
    parts: ObjectParts;
}

interface GameObject {
    id: number;
    _lastpos: [number, number, number];
    pos: [number, number, number];
    rotation: number;
    sprite: GameSprite;

    trigger: (event: string) => void;

    move: (pos: [number, number], time: number) => void;
}
