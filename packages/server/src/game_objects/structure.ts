import type { EntityStateSnapshot } from "@bundu/shared/object_types.js";
import type { ServerPacket } from "@bundu/shared/packet_definitions.js";
import {
    Door,
    Health,
    Physics,
    Rotting,
    Spiked,
    TileEntity,
    Type,
} from "../components/base.js";
import { BuildingConfigs } from "../configs/loaders/buildings.js";
import { GameObject } from "../engine";
import { GameObjectData } from "@bundu/shared/object_types.js";
import { deciPacketPos } from "./tile_entity.js";
import { getVariantId } from "@bundu/shared/variant_map.js";

/**
 * A placed structure / static prop with config-defined durability.
 */
export class Structure extends GameObject {
    constructor(physics: Physics, type: Type, tile: TileEntity) {
        super();
        const config = BuildingConfigs.get(type.id);
        const maxHealth = config.health;
        this.add(new Physics(physics))
            .add(new Type(type))
            .add(new TileEntity(tile))
            .add(new Health({ max: maxHealth, value: maxHealth, lastRegen: 0 }));
        if (config.class === "door") this.add(new Door());
    }

    public override getNewObjectPacket(): ServerPacket.LoadObject | undefined {
        const physics = this.get(Physics);
        const type = this.get(Type);
        const health = this.get(Health);
        const pos = deciPacketPos(physics);

        return {
            id: this.id,
            x: pos.x,
            y: pos.y,
            rotation: physics.rotation,
            type: GameObjectData.StructureType,
            data: [
                type.id,
                getVariantId(type.variant),
                health.value,
                health.max,
                this.getStateSnapshot(),
            ],
        };
    }

    /**
     * Project sim components into the client entity-state snapshot.
     * Always includes `rotting` / `spiked` / `ownerId` so clears coalesce via SetStructureState.
     * `ownerId` is `-1` when unowned (rotting or never placed by a player).
     */
    getStateSnapshot(): EntityStateSnapshot {
        const states: EntityStateSnapshot = {
            rotting: Rotting.get(this) !== undefined,
            spiked: Spiked.get(this) !== undefined,
            ownerId: this.get(TileEntity).ownerId ?? -1,
        };
        const door = Door.get(this);
        if (door) states.open = door.open;
        return states;
    }
}
