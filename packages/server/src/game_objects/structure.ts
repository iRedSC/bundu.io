import type { ServerPacket } from "@bundu/shared/packet_definitions.js";
import {
    Door,
    Health,
    Physics,
    Rotting,
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

    public override getNewObjectPacket(): ServerPacket.LoadObject | void {
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

    private getStateSnapshot() {
        const door = Door.get(this);
        const rotting = Rotting.get(this);
        if (!door && !rotting) return undefined;
        return {
            ...(door ? { open: door.open } : {}),
            ...(rotting ? { rotting: true } : {}),
        };
    }
}
