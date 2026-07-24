import { ServerPacketReceiver, World } from "../engine";
import { loadConfigs } from "../configs/loaders/load";
import { PlayerSystem } from "../systems/player";
import {
    ClientPacket,
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
import { SpikeSystem } from "../systems/spike";
import { AttributesSystem } from "../systems/attributes";
import { ResourceSystem } from "../systems/resource";
import { GroundItemSystem } from "../systems/ground_item";
import { PointGeneratorSystem } from "../systems/point_generator";
import { DoorSystem } from "../systems/door";
import { InteractionSystem } from "../systems/interaction";
import { RoofSystem } from "../systems/roof";
import {
    AnonOcclusionSystem,
    getAnonProxyId,
} from "../systems/anon_occlusion";
import { RottingSystem } from "../systems/rotting";
import { AnimalSystem } from "../systems/animal";
import { HungerSystem } from "../systems/hunger";
import { EffectContextSystem } from "../systems/effect_contexts";
import { TemperatureSystem } from "../systems/temperature";
import { ThirstSystem } from "../systems/thirst";
import { AirSystem } from "../systems/air";
import { AdminEditorSystem } from "../admin/editor";
import { CreativeModeSystem } from "../creative/mode";
import { FreecamGhostSystem } from "../systems/freecam_ghost";

export type ServerWorld = {
    world: World;
    playerSystem: PlayerSystem;
    renderDistanceSystem: RenderDistanceSystem;
    receiver: ServerPacketReceiver;
    adminEditor: AdminEditorSystem;
};

export function createWorld(): ServerWorld {
    const world = new World();
    world.context = createServerContext();
    // Anon proxies use a different object id; dual-queue player FX onto them.
    world.context.worldPacketManager.forwardEmitId = getAnonProxyId;
    loadConfigs();

    const playerSystem = new PlayerSystem(world);
    const adminEditor = new AdminEditorSystem(world);
    const creativeMode = new CreativeModeSystem(world);
    const renderDistanceSystem = new RenderDistanceSystem(world);
    const freecamGhostSystem = new FreecamGhostSystem(world);
    playerSystem.setRenderDistanceSystem(renderDistanceSystem);
    playerSystem.setFreecamGhostSystem(freecamGhostSystem);
    playerSystem.setCreativeModeSystem(creativeMode);
    adminEditor.setFreecamGhostSystem(freecamGhostSystem);
    const serializer = new Serializer<ClientPacketMap>(ClientSchema);
    const receiver = new ServerPacketReceiver(serializer, ClientPacketGuards, {
        latestWinsIds: new Set([
            ClientPacket.Movement,
            ClientPacket.Rotation,
            ClientPacket.ViewBounds,
            ClientPacket.FreecamCursor,
        ]),
    });
    setupPacketReceiving(receiver, playerSystem, adminEditor, creativeMode);

    const roofSystem = new RoofSystem(world);
    const anonOcclusionSystem = new AnonOcclusionSystem(world, roofSystem);

    world
        .addSystem(new AttributesSystem(world))
        .addSystem(playerSystem)
        .addSystem(adminEditor)
        .addSystem(creativeMode)
        .addSystem(new PositionSystem(world))
        .addSystem(new CollisionSystem(world))
        .addSystem(new HealthSystem(world))
        .addSystem(new HungerSystem(world))
        .addSystem(new EffectContextSystem(world))
        .addSystem(new TemperatureSystem(world))
        .addSystem(new ThirstSystem(world))
        .addSystem(new AirSystem(world))
        .addSystem(new AttackSystem(world))
        .addSystem(new SpikeSystem(world))
        .addSystem(new RottingSystem(world))
        .addSystem(new InteractionSystem(world))
        .addSystem(new DoorSystem(world))
        .addSystem(roofSystem)
        .addSystem(new ResourceSystem(world))
        .addSystem(new AnimalSystem(world))
        .addSystem(new GroundItemSystem(world))
        .addSystem(new StructureSystem(world))
        .addSystem(new PointGeneratorSystem(world))
        .addSystem(anonOcclusionSystem)
        .addSystem(renderDistanceSystem)
        .addSystem(freecamGhostSystem);

    return { world, playerSystem, renderDistanceSystem, receiver, adminEditor };
}
