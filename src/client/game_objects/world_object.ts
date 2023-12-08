import * as PIXI from "pixi.js";

export type SpriteManager = {
    container: PIXI.Container;
    trigger(name: string): void;
};

type Point = { x: number; y: number };

export class WorldObject {
    id: number;

    pos: Point;
    rotation: number;

    sprite: SpriteManager;

    constructor(
        id: number,
        pos: Point,
        rotation: number,
        sprite: SpriteManager
    ) {
        this.id = id;
        this.pos = pos;
        this.rotation = rotation;
        this.sprite = sprite;
    }
}
