import * as PIXI from "pixi.js";
import { degrees } from "../../lib/transforms";

interface PreviousData {
    time: number;
    pos: PIXI.Point;
    rotation: number;
}

export class WorldObject {
    time: number;
    previousData: PreviousData;
    pos: PIXI.Point;
    rotation: number;
    size: number;
    sprite: PIXI.Sprite;
    container: PIXI.Container;
    zIndex: number;

    constructor(
        time: number,
        pos: PIXI.Point,
        rotation: number,
        size: number,
        sprite: string,
        zIndex: number
    ) {
        this.time = time;

        this.pos = pos;

        this.size = size;

        this.rotation = rotation;

        this.zIndex = zIndex;

        this.container = new PIXI.Container();
        this.container.zIndex = zIndex;
        this.container.pivot.set(
            this.container.width / 2,
            this.container.height / 2
        );

        this.container.position.set(this.pos.x, this.pos.y);

        this.sprite = PIXI.Sprite.from(`./assets/${sprite}`, {
            mipmap: PIXI.MIPMAP_MODES.ON,
        });
        this.sprite.rotation = degrees(-90);
        this.sprite.scale.set(size);
        this.sprite.anchor.set(0.5);

        this.container.addChild(this.sprite);

        this.previousData = {
            time: this.time,
            pos: this.pos,
            rotation: this.rotation,
        };
    }

    update() {}
}
