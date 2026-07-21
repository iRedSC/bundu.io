import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import {
    AnimalData,
    Health,
    Living,
    Physics,
    Spiked,
    TileEntity,
    Type,
} from "../components/base.js";
import {
    BuildingConfigs,
    spikeConfigForMaterial,
} from "../configs/loaders/buildings.js";
import { gameplayConfig } from "../configs/gameplay.js";
import { type GameObject, System, type World } from "../engine";
import { getSizedBounds, SPATIAL_QUERY_PADDING } from "./position.js";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { isStructureFriendlyTo } from "./structure_friendly.js";
import { footprintIntersectsCircle } from "./tile_entity_geometry.js";
import { modelBoundsPadding } from "../configs/model_bounds.js";

/**
 * Contact DPS and on-hit reflect for spiked walls/doors.
 * Players take contact DPS immediately; animals only after they attack first.
 */
export class SpikeSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [Spiked, Physics, Type], 1);
        this.listen(GameEvent.Hurt, this.onHit, [Spiked]);
        this.listen(GameEvent.ToggleDoor, this.onHitDoor, [Spiked]);
    }

    override update(time: number, _delta: number, structure: GameObject) {
        const spike = spikeConfigFor(structure);
        if (!spike?.damage) return;

        const physics = structure.get(Physics);
        const spiked = structure.get(Spiked);
        const interval = gameplayConfig().spikes.attackIntervalMs;
        const range = Math.max(0, spike.attack_range ?? 0);
        const occupied = structure.get(TileEntity).occupied;
        const queryPadding = SPATIAL_QUERY_PADDING + modelBoundsPadding();

        const nearby = this.world.query(
            [Physics, Health, Living],
            this.world.context.quadtree.query(
                getSizedBounds(
                    physics.position,
                    queryPadding,
                    queryPadding
                )
            )
        );

        let attacked = false;
        for (const target of nearby) {
            if (target.id === structure.id) continue;
            if (isStructureFriendlyTo(structure, target)) continue;
            if (
                AnimalData.get(target) &&
                !spiked.hostileAnimalIds.has(target.id)
            ) {
                continue;
            }
            if (
                !footprintIntersectsCircle(
                    occupied,
                    target.get(Physics).collider,
                    range
                )
            ) {
                continue;
            }
            const nextAt = spiked.nextHitAt.get(target.id) ?? 0;
            if (time < nextAt) continue;

            spiked.nextHitAt.set(target.id, time + interval);
            attacked = true;
            this.trigger(GameEvent.Hurt, {
                object: target,
                source: structure,
                damage: scaleSpikeDamage(spike.damage, target),
            });
            this.world.context.worldPacketManager.emit(ServerPacket.HitEvent, {
                id: target.id,
                angle: 0,
                strength: 0,
                flash: 0,
            });
        }

        if (attacked) {
            this.world.context.worldPacketManager.emit(ServerPacket.AttackEvent, {
                id: structure.id,
                start: 0,
                length: 0,
                width: 0,
            });
        }
    }

    private onHit = ({ object, source }: GameEvent.Hurt) => {
        if (!source) return;
        this.reflect(object, source);
    };

    private onHitDoor = ({ object, source }: GameEvent.ToggleDoor) => {
        if (!source) return;
        this.reflect(object, source);
    };

    private reflect(structure: GameObject, source: GameObject) {
        if (!Living.get(source)) return;
        if (isStructureFriendlyTo(structure, source)) return;
        if (AnimalData.get(source)) {
            structure.get(Spiked).hostileAnimalIds.add(source.id);
        }
        const spike = spikeConfigFor(structure);
        const damage = spike?.on_hit_damage;
        if (!damage) return;
        this.trigger(GameEvent.Hurt, {
            object: source,
            source: structure,
            damage: scaleSpikeDamage(damage, source),
        });
        this.world.context.worldPacketManager.emit(ServerPacket.AttackEvent, {
            id: structure.id,
            start: 0,
            length: 0,
            width: 0,
        });
        this.world.context.worldPacketManager.emit(ServerPacket.HitEvent, {
            id: source.id,
            angle: 0,
            strength: 0,
            flash: 0,
        });
    }
}

function spikeConfigFor(structure: GameObject) {
    const material = BuildingConfigs.get(Type.get(structure)?.id).material;
    if (!material) return undefined;
    return spikeConfigForMaterial(material);
}

function scaleSpikeDamage(damage: number, target: GameObject): number {
    if (!AnimalData.get(target)) return damage;
    return damage * gameplayConfig().spikes.animalDamageMultiplier;
}
