import { getNumericId } from "@bundu/shared/id_map";
import { TileEntity, Type } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { BuildingConfigs } from "../configs/loaders/buildings.js";
import { type GameObject, System, type World } from "../engine";
import type { GameEventMap } from "./event_map.js";

const POINT_GENERATOR_ID = getNumericId("point_generator");

export class PointGeneratorSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [TileEntity, Type], 1);
    }

    override update(_time: number, _delta: number, generator: GameObject) {
        if (generator.get(Type).id !== POINT_GENERATOR_ID) return;

        const ownerId = generator.get(TileEntity).ownerId;
        if (ownerId === undefined) return;

        const owner = this.world.getObject(ownerId);
        const player = owner && PlayerData.get(owner);
        if (!player) return;

        player.score += BuildingConfigs.get(POINT_GENERATOR_ID).pointsPerSecond;
    }
}
