import { AnimationManager } from "../lib/animation";

type ObjectParts = { [key: string]: any };

type GameSprite = {
    animationManager: AnimationManager;
    parts: ObjectParts;
};

type State = [time: number, x: number, y: number, rotation: number];
type Gear = [selectedItem: number, helmet: number, backpack: number];
export type GameObject = {
    id: number;
    lastpos: State;
    pos: [number, number];
    nextPos: State;
    rotation: number;
    sprite: GameSprite;

    update: (state?: State, gear?: Gear) => void;

    trigger: (event: string) => void;

    move: () => void;
};
