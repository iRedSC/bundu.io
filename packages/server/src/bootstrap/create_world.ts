import { ServerPacketReceiver, World } from "../engine";
import { loadConfigs } from "../configs/loaders/load";
import { PlayerSystem } from "../systems/player";
import {
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

export type ServerWorld = {
    world: World;
    playerSystem: PlayerSystem;
    receiver: ServerPacketReceiver;
};

export function createWorld(): ServerWorld {
    const world = new World();
    world.context = createServerContext();
    loadConfigs();

    const playerSystem = new PlayerSystem(world);
    const serializer = new Serializer<ClientPacketMap>(ClientSchema);
    const receiver = new ServerPacketReceiver(serializer);
    setupPacketReceiving(receiver, playerSystem);

    world
        .addSystem(new AttributesSystem(world))
        .addSystem(playerSystem)
        .addSystem(new PositionSystem(world))
        .addSystem(new CollisionSystem(world))
        .addSystem(new HealthSystem(world))
        .addSystem(new AttackSystem(world))
        .addSystem(new StructureSystem(world))
        .addSystem(new RenderDistanceSystem(world));

    return { world, playerSystem, receiver };
}
