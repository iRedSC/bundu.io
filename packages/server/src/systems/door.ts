import { testCircleCircle } from "sat";
import { Door, Physics, TileEntity } from "../components/base.js";
import { System, type GameObject, type World } from "../engine";
import { syncStructureStates } from "../network/object_state.js";
import { GameEvent, type GameEventMap } from "./event_map.js";

/** Handles the collision and visible state of player-operated doors. */
export class DoorSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [Door, Physics, TileEntity]);
        this.listen(GameEvent.ToggleDoor, this.toggle, [Door, Physics, TileEntity]);
    }

    private toggle({ object }: GameEvent.ToggleDoor) {
        const door = object.get(Door);
        const tile = object.get(TileEntity);

        if (door.open) {
            if (this.isBlocked(object) || !this.world.context.occupancy.occupy(object.id, tile.occupied)) {
                return;
            }
        } else {
            this.world.context.occupancy.release(object.id);
        }

        door.open = !door.open;
        syncStructureStates(this.world, object);
    }

    private isBlocked(door: GameObject): boolean {
        const doorPhysics = door.get(Physics);
        return this.world.query([Physics]).some((object) => {
            if (object.id === door.id || TileEntity.get(object)) return false;
            return testCircleCircle(doorPhysics.collider, object.get(Physics).collider);
        });
    }
}
