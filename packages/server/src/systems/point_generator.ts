import { TileEntity, Type } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { BuildingConfigs } from "../configs/loaders/buildings.js";
import { type GameObject, System, type World } from "../engine";
import { Structure } from "../game_objects/structure.js";
import type { GameEventMap } from "./event_map.js";

export class PointGeneratorSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [TileEntity, Type], 1);
    }

    override update(_time: number, _delta: number, generator: GameObject) {
        if (!(generator instanceof Structure)) return;
        const points = BuildingConfigs.get(generator.get(Type).id).pointsPerSecond;
        if (points <= 0) return;

        const ownerId = generator.get(TileEntity).ownerId;
        if (ownerId === undefined) return;

        const owner = this.world.getObject(ownerId);
        const player = owner && PlayerData.get(owner);
        if (!player) return;

        player.score += points;
    }
}
