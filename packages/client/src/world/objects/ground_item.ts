import { lerp, radians } from "@bundu/shared/transforms";
import { getStringId } from "@bundu/shared/id_map";
import type { Point } from "pixi.js";
import { SpriteFactory } from "@client/assets/sprite_factory";
import GameObject from "../game_object";

const ITEM_SIZE = 36;
const POP_LERP = 0.16;

/** A rendered item stack. Drops briefly travel from their thrower to the ground. */
export class GroundItem extends GameObject {
    private target?: Point;

    constructor(id: number, itemId: number, position: Point, rotation: number) {
        super(id, position, radians(rotation), 12, 1);
        const sprite = SpriteFactory.build(getStringId(itemId));
        sprite.width = ITEM_SIZE;
        sprite.height = ITEM_SIZE;
        sprite.anchor.set(0.5);
        this.container.addChild(sprite);
        this.container.zIndex = 2;
    }

    popFrom(origin: Point, target: Point) {
        this.positionStates.snap(origin);
        this.container.position.copyFrom(origin);
        this.target = target;
        this.container.scale.set(0.65);
    }

    override update(): boolean {
        if (!this.target) return super.update();

        const position = this.container.position;
        position.x = lerp(position.x, this.target.x, POP_LERP);
        position.y = lerp(position.y, this.target.y, POP_LERP);
        const scale = lerp(this.container.scale.x, 1, POP_LERP);
        this.container.scale.set(scale);
        const x = position.x - this.target.x;
        const y = position.y - this.target.y;
        if (x * x + y * y > 4) return false;

        this.positionStates.snap(this.target);
        this.container.position.copyFrom(this.target);
        this.container.scale.set(1);
        this.target = undefined;
        return true;
    }
}
