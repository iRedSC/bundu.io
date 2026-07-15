import { Attributes } from "../components/attributes.js";
import { type GameObject, System, type World } from "../engine";
import type { GameEventMap } from "./event_map.js";

/**
 * Expires timed attribute modifiers on the game tick using `world.gameTime`.
 */
export class AttributesSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [Attributes]);
    }

    override update(time: number, _delta: number, object: GameObject): void {
        object.get(Attributes).expire(time);
    }
}
