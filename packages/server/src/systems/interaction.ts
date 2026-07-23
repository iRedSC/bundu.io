import { pointToTile } from "@bundu/shared";
import { Door, Physics, Rotting, TileEntity } from "../components/base.js";
import { Attributes } from "../components/attributes.js";
import { PlayerData } from "../components/player.js";
import { System, type World } from "../engine";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { hasOwnedClearTileLine } from "./tile_line.js";

/** Min gap between successful Interact toggles (anti-spam / flicker). */
const INTERACT_COOLOFF_MS = 250;

/** Server-authoritative right-click interactions (doors for now). */
export class InteractionSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, []);
        this.listen(GameEvent.Interact, this.interact);
    }

    private interact({ object: source, target }: GameEvent.Interact) {
        const door = Door.get(target);
        if (!door || Rotting.get(target)) return;

        const data = PlayerData.get(source);
        const sourcePhysics = Physics.get(source);
        const targetPhysics = Physics.get(target);
        const attributes = Attributes.get(source);
        if (!data || !sourcePhysics || !targetPhysics || !attributes) return;

        const now = this.world.gameTime;
        if (
            data.lastInteractTime !== undefined &&
            now - data.lastInteractTime < INTERACT_COOLOFF_MS
        ) {
            return;
        }

        const reach = Math.max(0, attributes.get("interaction.reach"));
        const distance = Math.hypot(
            targetPhysics.position.x - sourcePhysics.position.x,
            targetPhysics.position.y - sourcePhysics.position.y
        );
        if (distance > reach) return;

        const targetTile =
            TileEntity.get(target)?.origin ??
            pointToTile(targetPhysics.position);
        if (
            !hasOwnedClearTileLine(
                this.world,
                sourcePhysics.position,
                targetTile,
                source.id
            )
        ) {
            return;
        }

        data.lastInteractTime = now;
        this.trigger(GameEvent.ToggleDoor, { object: target, source });
    }
}
