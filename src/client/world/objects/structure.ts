import * as PIXI from "pixi.js";
import { radians } from "../../../lib/transforms";
import { WorldObject } from "./world_object";
import { ANIMATION, hit } from "../../animation/animations";
import { spriteConfigs } from "../../configs/sprite_configs";
import { SpriteFactory, SpriteWrapper } from "../../assets/sprite_factory";
// type StructureData = [id: number, pos: number, size: number, rotation: number];

export class Structure extends WorldObject {
    sprite: SpriteWrapper;

    constructor(
        id: number,
        type: string,
        pos: PIXI.Point,
        rotation: number,
        size: number
    ) {
        super(id, pos, rotation, size);
        const config = spriteConfigs.get(type);
        this.sprite = SpriteFactory.build(type, config?.world_display);

        this.zIndex = 10;
        this.pivot.set(this.width / 2, this.height / 2);
        this.sprite.setRotation(rotation - radians(-90));
        this.sprite.anchor.set(0.5);
        this.addChild(this.sprite);

        this.rotation = rotation;

        this.animations = new Map();
        this.animations.set(ANIMATION.HURT, hit(this));
    }
}
