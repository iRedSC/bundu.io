import * as PIXI from "pixi.js";
import { degrees } from "../../lib/transforms";
import { NIGHT_COLOR } from "../constants";

// type StructureData = [id: number, pos: number, size: number, rotation: number];

interface StructureParts {
    container: PIXI.Container;
    sprite: PIXI.Sprite;
}

export class Structure {
    id: number;
    pos: PIXI.Point;
    size: number;
    rotation: number;
    parts: StructureParts;

    constructor(
        id: number,
        pos: [x: number, y: number],
        size: number,
        rotation: number,
        type: string
    ) {
        this.id = id;

        this.pos = new PIXI.Point(pos[0], pos[1]);

        this.rotation = rotation;
        this.size = size;

        this.parts = {
            container: new PIXI.Container(),
            sprite: PIXI.Sprite.from(`./assets/${type}.svg`, {
                mipmap: PIXI.MIPMAP_MODES.ON,
            }),
        };
        this.parts.container.pivot.set(
            this.parts.container.width / 2,
            this.parts.container.height / 2
        );
        this.parts.container.position.set(this.pos.x, this.pos.y);
        this.parts.sprite = PIXI.Sprite.from(`./assets/${type}.svg`, {
            mipmap: PIXI.MIPMAP_MODES.ON,
        });
        this.parts.sprite.rotation = rotation - degrees(-90);
        this.parts.sprite.anchor.set(0.5);
        this.parts.container.addChild(this.parts.sprite);
        this.parts.sprite.scale.set(this.size);
    }
    update() {}

    setNight() {
        this.parts.sprite.tint = NIGHT_COLOR;
    }

    setDay() {
        this.parts.sprite.tint = 0xffffff;
    }
}
