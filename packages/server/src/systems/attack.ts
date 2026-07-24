import {
    attackBoxPoints,
    attackFacingRadians,
    lookToward,
    moveInDirection,
    radians,
    type BasicPoint,
} from "@bundu/shared";
import {
    Attributes,
    type AttackDamageChannel,
} from "../components/attributes.js";
import { AnimalData, Physics, TileEntity } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { type GameObject, System, type World } from "../engine";
import { getSizedBounds, SPATIAL_QUERY_PADDING } from "./position.js";
import SAT from "sat";
import { ServerPacket } from "@bundu/shared/packet_definitions.js";
import { GameEvent, type GameEventMap } from "./event_map.js";
import {
    footprintIntersectsPolygon,
    nearestFootprintPoint,
} from "./tile_entity_geometry.js";
import { structureFootprintPadding } from "../configs/loaders/buildings.js";

/** Target channel under `attack.damage` for typed combat resolve. */
export function attackDamageChannel(
    target: GameObject
): AttackDamageChannel | undefined {
    if (TileEntity.get(target)) return "building";
    if (AnimalData.get(target)) return "animal";
    return undefined;
}

function resolveAttackDamage(
    source: GameObject,
    target: GameObject,
    fallback: number | undefined
): number {
    const attrs = Attributes.get(source);
    if (attrs && PlayerData.get(source)) {
        return attrs.resolve("attack.damage", attackDamageChannel(target));
    }
    return fallback ?? 0;
}

function pointToVec(point: BasicPoint) {
    return new SAT.Vector(point.x, point.y);
}

export function attackBox(
    start: SAT.Vector,
    direction: number,
    length: number,
    width: number
): SAT.Polygon {
    const points = attackBoxPoints(
        { x: start.x, y: start.y },
        direction,
        length,
        width
    );
    return new SAT.Polygon(
        new SAT.Vector(),
        points.map((p) => new SAT.Vector(p.x, p.y))
    );
}

export function testForIntersection(
    polygon: SAT.Polygon,
    collisionTest: GameObject[]
) {
    const hitObjects: Map<number, GameObject> = new Map();

    for (const other of collisionTest) {
        const physics = other.get(Physics);
        if (!physics) continue;
        const tile = TileEntity.get(other);
        if (
            tile
                ? footprintIntersectsPolygon(tile.occupied, polygon)
                : SAT.testPolygonCircle(polygon, physics.collider)
        ) {
            hitObjects.set(other.id, other);
        }
    }
    return hitObjects;
}

export class AttackSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [Physics]);
        this.listen(GameEvent.Attack, this.attack);
    }

    attack({ object: source, damage, weapon, hitbox }: GameEvent.Attack) {
        const physics = Physics.get(source);
        if (!physics) return;

        const queryPadding =
            SPATIAL_QUERY_PADDING + structureFootprintPadding();
        const bounds = getSizedBounds(
            physics.position,
            queryPadding,
            queryPadding
        );

        const nearby = this.world.query(
            [Physics],
            this.world.context.quadtree.query(bounds)
        );

        let start = 0;
        let length = 5;
        let width = 5;
        if (hitbox) {
            start = hitbox.start;
            length = hitbox.length;
            width = hitbox.width;
        }

        // physics.rotation is degrees (client sends degrees); SAT/math use radians.
        const facing = attackFacingRadians(radians(physics.rotation));
        const origin = moveInDirection(physics.position, facing, start);
        const hitRange = attackBox(
            pointToVec(origin),
            facing,
            length,
            width
        );

        // Sync animal facing so the client can aim the attack anim (animals
        // otherwise only derive facing from movement).
        if (AnimalData.get(source)) {
            this.world.context.worldPacketManager.set(ServerPacket.SetRotation, {
                id: source.id,
                rotation: physics.rotation,
            });
        }

        this.world.context.worldPacketManager.emit(ServerPacket.AttackEvent, {
            id: source.id,
            start,
            length,
            width,
        });

        const hits = testForIntersection(hitRange, nearby);
        hits.delete(source.id);
        for (const object of hits.values()) {
            const targetPhysics = Physics.get(object);
            // Attack direction from the hit origin into the target (not attacker facing).
            const targetPoint =
                nearestFootprintPoint(
                    TileEntity.get(object)?.occupied ?? [],
                    origin
                ) ?? targetPhysics?.position;
            const angle = targetPoint
                ? lookToward(origin, targetPoint)
                : facing;
            const hit = { strength: 0 };
            this.trigger(GameEvent.Hurt, {
                object,
                source,
                damage: resolveAttackDamage(source, object, damage),
                weapon,
                hit,
            });
            this.world.context.worldPacketManager.emit(ServerPacket.HitEvent, {
                id: object.id,
                angle,
                strength: hit.strength,
                flash: 0,
            });
        }
    }
}
