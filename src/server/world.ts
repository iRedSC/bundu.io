import { Resource } from "./game_objects/resource.js";
import { Player } from "./game_objects/player.js";
import { Entity, testForIntersection } from "./game_objects/entity.js";
import { Quadtree } from "../lib/quadtree.js";
import { Range } from "../lib/range.js";
import SAT from "sat";
import { WorldObject } from "./game_objects/base.js";
import { Ground } from "./game_objects/ground.js";
import { ACTION, PACKET_TYPE } from "../shared/enums.js";
import { degrees, moveInDirection, moveToward } from "../lib/transforms.js";

type UpdateList = {
    entities: Map<number, Entity>;
    players: Map<number, Player>;
    generics: Map<number, WorldObject>;
};

// Holds all the actual world items as different quadtrees
export class World {
    nextId: number;
    mapBounds: Range;
    resources: Quadtree<Resource>;
    players: Quadtree<Player>;
    entities: Quadtree<Entity>;
    ground: Ground[];

    constructor() {
        this.nextId = 0;
        this.mapBounds = new Range({ x: 0, y: 0 }, { x: 20000, y: 20000 });
        this.resources = new Quadtree(
            new Map<number, Resource>(),
            this.mapBounds,
            10
        );
        this.entities = new Quadtree(
            new Map<number, Entity>(),
            this.mapBounds,
            10
        );
        this.players = new Quadtree(
            new Map<number, Player>(),
            this.mapBounds,
            10
        );
        this.ground = [];
    }

    tick(updateList: UpdateList) {
        const player = this.players.get(1);
        for (let [id, entity] of this.entities.objects.entries()) {
            const detectionRange = collisionBounds(entity.position);
            const collisionTest = this.resources.query(detectionRange);

            const moved = entity.move(
                collisionTest,
                player?.position || new SAT.Vector()
            );
            if (moved) {
                const players = this.players.query(detectionRange);
                players.forEach((player) => {
                    player.updateHandler.move.push(entity);
                    player.updateHandler.rotate.push(entity);
                });
            }
            this.entities.insert(entity);
        }
        for (let [id, player] of this.players.objects.entries()) {
            const moved = player.move();
            const movedObjects = [];
            const collided = collideCircle(player, this, movedObjects);
            if (moved || collided) {
                const detectionRange = collisionBounds(player.position);
                const players = this.players.query(detectionRange);
                players.forEach((other) => {
                    other.updateHandler.move.push(player, ...movedObjects);
                });
            }
            console.log(movedObjects);
        }
    }

    attack(player: Player) {
        const detectionRange = collisionBounds(player.position);
        const resources = this.resources.query(detectionRange);
        const _hitRange = moveInDirection(
            player.position,
            player.rotation + degrees(90),
            50
        );
        const hitRange = new SAT.Vector(_hitRange.x, _hitRange.y);

        console.log(resources);
        const hit = testForIntersection(player.position, hitRange, resources);
        console.log(hit);

        const packet: any[] = [PACKET_TYPE.ACTION];
        for (let object of hit) {
            packet.push(object.id, ACTION.HURT);
        }
        for (let player of this.players.objects.values()) {
            player.socket.send(JSON.stringify(packet));
        }
    }
}

export function collisionBounds(pos: {
    x: number;
    y: number;
    [key: string]: any;
}) {
    const dist = 500;
    const p1 = { x: pos.x - dist, y: pos.y - dist };
    const p2 = { x: pos.x + dist, y: pos.y + dist };
    return new Range(p1, p2);
}

function collide(
    object: WorldObject,
    others: Iterable<WorldObject>,
    updateList: WorldObject[],
    worldList: Quadtree<WorldObject>
) {
    let success = false;
    for (const other of others) {
        const response = new SAT.Response();
        const overlap = SAT.testCircleCircle(
            object.collider,
            other.collider,
            response
        );
        if (overlap) {
            const responseV = response.overlapV.scale(0.5, 0.5);
            object.collider.pos.sub(responseV);
            other.collider.pos.add(responseV);
            updateList.push(other);
            worldList.insert(other);
            success = true;
        }
    }
    return success;
}

function collideCircle(
    object: WorldObject,
    world: World,
    updateList: WorldObject[]
) {
    const detectionRange = collisionBounds(object.position);
    const resources = world.resources.query(detectionRange);
    const entities = world.entities.query(detectionRange);
    const rcol = collide(object, resources, updateList, world.resources);
    const ecol = collide(object, entities, updateList, world.entities);
    if (rcol || ecol) {
        return true;
    }
    return false;
}
