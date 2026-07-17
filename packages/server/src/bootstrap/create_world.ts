import { ServerPacketReceiver, World } from "../engine";
import { loadConfigs } from "../configs/loaders/load";
import { PlayerSystem } from "../systems/player";
import {
    ClientPacketGuards,
    type ClientPacketMap,
    ClientSchema,
} from "@bundu/shared/packet_definitions";
import { setupPacketReceiving } from "../network/receiver";
import { createServerContext } from "../network/managers";
import { PositionSystem } from "../systems/position";
import { CollisionSystem } from "../systems/collision";
import { HealthSystem } from "../systems/health";
import { Serializer } from "@bundu/shared";
import { AttackSystem } from "../systems/attack";
import { RenderDistanceSystem } from "../systems/render_distance";
import { StructureSystem } from "../systems/structure";
import { AttributesSystem } from "../systems/attributes";
import { ResourceSystem } from "../systems/resource";
import { GroundItemSystem } from "../systems/ground_item";
import { PointGeneratorSystem } from "../systems/point_generator";
import { DoorSystem } from "../systems/door";
import { RottingSystem } from "../systems/rotting";
import { AnimalSystem } from "../systems/animal";
import { HungerSystem } from "../systems/hunger";
import { NearFireSystem } from "../systems/near_fire";
import { TemperatureSystem } from "../systems/temperature";

export type ServerWorld = {
    world: World;
    playerSystem: PlayerSystem;
    renderDistanceSystem: RenderDistanceSystem;
    receiver: ServerPacketReceiver;
};

export function createWorld(): ServerWorld {
    const world = new World();
    world.context = createServerContext();
    loadConfigs();

    const playerSystem = new PlayerSystem(world);
    const renderDistanceSystem = new RenderDistanceSystem(world);
    const serializer = new Serializer<ClientPacketMap>(ClientSchema);
    const receiver = new ServerPacketReceiver(serializer, ClientPacketGuards);
    setupPacketReceiving(receiver, playerSystem);

    world
        .addSystem(new AttributesSystem(world))
        .addSystem(playerSystem)
        .addSystem(new PositionSystem(world))
        .addSystem(new CollisionSystem(world))
        .addSystem(new HealthSystem(world))
        .addSystem(new HungerSystem(world))
        .addSystem(new NearFireSystem(world))
        .addSystem(new TemperatureSystem(world))
        .addSystem(new AttackSystem(world))
        .addSystem(new RottingSystem(world))
        .addSystem(new DoorSystem(world))
        .addSystem(new ResourceSystem(world))
        .addSystem(new AnimalSystem(world))
        .addSystem(new GroundItemSystem(world))
        .addSystem(new StructureSystem(world))
        .addSystem(new PointGeneratorSystem(world))
        .addSystem(renderDistanceSystem);

    return { world, playerSystem, renderDistanceSystem, receiver };
}
