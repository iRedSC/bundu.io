import fs from "node:fs";
import path from "node:path";
import { Box, Circle, Vector } from "sat";
import type { World } from "../engine";
import { restoreObjectId } from "../engine";
import {
    AnimalData,
    Door,
    GroundData,
    GroundItemData,
    Health,
    Physics,
    ResourceData,
    Rotting,
    TileEntity,
    Type,
    type TileEntity as TileEntityData,
} from "../components/base";
import { Attributes, type AttributesData } from "../components/attributes";
import { Inventory, type Inventory as InventoryData } from "../components/inventory";
import { PlayerData, type PlayerData as PlayerState } from "../components/player";
import { Stats, type StatsData } from "../components/stats";
import { Ground } from "../game_objects/ground";
import { GroundItem } from "../game_objects/ground_item";
import { Resource } from "../game_objects/resource";
import { Structure } from "../game_objects/structure";
import { Animal } from "../game_objects/animal";
import { Player } from "../game_objects/player";
import { makeTileEntity } from "../game_objects/tile_entity";

const defaultFilename = path.resolve(
    import.meta.dir,
    "../../../../.cache/dev-world.json"
);

type PhysicsSnapshot = {
    x: number;
    y: number;
    rotation: number;
    collisionRadius: number;
    speed: number;
};

type TileSnapshot = Omit<TileEntityData, "occupied">;
type BaseSnapshot = { id: number; physics: PhysicsSnapshot };

type ObjectSnapshot =
    | ({ kind: "ground"; x: number; y: number; width: number; height: number; groundType: number; speedMultiplier: number } & Pick<BaseSnapshot, "id">)
    | ({ kind: "resource"; type: number; variant?: string; tile?: TileSnapshot; scale: number; data: ResourceData } & BaseSnapshot)
    | ({ kind: "structure"; type: number; variant?: string; tile: TileSnapshot; health: Health; door?: Door; rotting: boolean } & BaseSnapshot)
    | ({ kind: "ground_item"; item: GroundItemData } & BaseSnapshot)
    | ({ kind: "animal"; type: number; variant?: string; health: Health; scale: number } & BaseSnapshot)
    | ({
        kind: "player";
        data: PlayerState;
        health: Health;
        inventory: InventoryData;
        attributes: AttributesData["types"];
        attributeNow: number;
        scale: number;
        stats: StatsData["types"];
    } & BaseSnapshot);

type DevCheckpoint = {
    format: 1;
    gameTime: number;
    objects: ObjectSnapshot[];
};

function filename(): string {
    return process.env.BUNDU_DEV_CHECKPOINT ?? defaultFilename;
}

function physicsSnapshot(physics: Physics): PhysicsSnapshot {
    return {
        x: physics.position.x,
        y: physics.position.y,
        rotation: physics.rotation,
        collisionRadius: physics.collisionRadius,
        speed: physics.speed,
    };
}

function restorePhysics(snapshot: PhysicsSnapshot): Physics {
    const position = new Vector(snapshot.x, snapshot.y);
    return {
        position,
        collider: new Circle(position, snapshot.collisionRadius),
        rotation: snapshot.rotation,
        collisionRadius: snapshot.collisionRadius,
        speed: snapshot.speed,
    };
}

function tileSnapshot(tile: TileEntityData): TileSnapshot {
    return {
        origin: { ...tile.origin },
        rot: tile.rot,
        ownerId: tile.ownerId,
        blocked: tile.blocked.map((cell) => ({ ...cell })),
    };
}

function snapshotObject(object: import("../engine").GameObject): ObjectSnapshot | undefined {
    const ground = GroundData.get(object);
    if (ground) {
        return {
            kind: "ground",
            id: object.id,
            x: ground.collider.pos.x,
            y: ground.collider.pos.y,
            width: ground.collider.w,
            height: ground.collider.h,
            groundType: ground.type,
            speedMultiplier: ground.speedMultiplier,
        };
    }

    const physics = Physics.get(object);
    if (!physics) return;
    const base = { id: object.id, physics: physicsSnapshot(physics) };
    const player = PlayerData.get(object);
    if (player) {
        const attributes = object.get(Attributes);
        return {
            ...base,
            kind: "player",
            data: structuredClone(player),
            health: structuredClone(object.get(Health)),
            inventory: structuredClone(object.get(Inventory)),
            attributes: structuredClone(attributes.types),
            attributeNow: attributes.now,
            scale: attributes.get("physics.scale"),
            stats: structuredClone(object.get(Stats).types),
        };
    }

    const type = Type.get(object);
    const animal = AnimalData.get(object);
    if (type && animal) {
        return {
            ...base,
            kind: "animal",
            type: type.id,
            variant: type.variant,
            health: structuredClone(object.get(Health)),
            scale: object.get(Attributes).get("physics.scale"),
        };
    }

    const item = GroundItemData.get(object);
    if (item) return { ...base, kind: "ground_item", item: structuredClone(item) };

    const resource = ResourceData.get(object);
    if (type && resource) {
        const tile = TileEntity.get(object);
        return {
            ...base,
            kind: "resource",
            type: type.id,
            variant: type.variant,
            tile: tile && tileSnapshot(tile),
            scale: object.get(Attributes).get("physics.scale"),
            data: structuredClone(resource),
        };
    }

    const tile = TileEntity.get(object);
    const health = Health.get(object);
    if (type && tile && health) {
        return {
            ...base,
            kind: "structure",
            type: type.id,
            variant: type.variant,
            tile: tileSnapshot(tile),
            health: structuredClone(health),
            door: structuredClone(Door.get(object)),
            rotting: Rotting.get(object) !== undefined,
        };
    }
}

export function saveDevCheckpoint(world: World): void {
    const target = filename();
    const checkpoint: DevCheckpoint = {
        format: 1,
        gameTime: world.gameTime,
        // Alive objects only (soft-disconnected players stay active).
        objects: [...world.objects.values()]
            .filter((object) => object.active)
            .map(snapshotObject)
            .filter((object): object is ObjectSnapshot => object !== undefined),
    };
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temporary = `${target}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(checkpoint));
    fs.renameSync(temporary, target);
    const players = checkpoint.objects.filter(
        (object) => object.kind === "player"
    );
    console.log(
        `[dev] checkpointed ${checkpoint.objects.length} objects ` +
            `(${players.length} player sessions)`
    );
}

function restoreTile(snapshot: TileSnapshot): TileEntityData {
    const tile = makeTileEntity(snapshot.origin, snapshot.rot, snapshot.blocked);
    tile.ownerId = snapshot.ownerId;
    return tile;
}

function unscaleRadius(physics: Physics, scale: number): void {
    if (scale <= 0) return;
    physics.collisionRadius /= scale;
    physics.collider.r = physics.collisionRadius;
}

function restoreObject(world: World, snapshot: ObjectSnapshot): void {
    if (snapshot.kind === "ground") {
        const collider = new Box(
            new Vector(snapshot.x, snapshot.y),
            snapshot.width,
            snapshot.height
        );
        const object = new Ground({
            collider,
            type: snapshot.groundType,
            speedMultiplier: snapshot.speedMultiplier,
            createPacket() {
                return [
                    this.type,
                    this.collider.pos.x,
                    this.collider.pos.y,
                    this.collider.w,
                    this.collider.h,
                ];
            },
        });
        restoreObjectId(object, snapshot.id);
        world.addObject(object);
        return;
    }

    const physics = restorePhysics(snapshot.physics);
    if (snapshot.kind === "resource") {
        unscaleRadius(physics, snapshot.scale);
        const object = new Resource(
            physics,
            { id: snapshot.type, variant: snapshot.variant },
            snapshot.tile && restoreTile(snapshot.tile),
            snapshot.scale
        );
        restoreObjectId(object, snapshot.id);
        world.addObject(object);
        Object.assign(object.get(ResourceData), structuredClone(snapshot.data));
        return;
    }
    if (snapshot.kind === "structure") {
        const object = new Structure(
            physics,
            { id: snapshot.type, variant: snapshot.variant },
            restoreTile(snapshot.tile)
        );
        restoreObjectId(object, snapshot.id);
        Object.assign(object.get(Health), snapshot.health);
        if (snapshot.door) Object.assign(object.get(Door), snapshot.door);
        if (snapshot.rotting) object.add(new Rotting());
        world.addObject(object);
        return;
    }
    if (snapshot.kind === "ground_item") {
        const object = new GroundItem(physics, structuredClone(snapshot.item));
        restoreObjectId(object, snapshot.id);
        world.addObject(object);
        return;
    }
    if (snapshot.kind === "animal") {
        const object = new Animal(
            { id: snapshot.type, variant: snapshot.variant },
            physics
        );
        restoreObjectId(object, snapshot.id);
        object.get(Attributes).set(
            "physics.scale",
            "base",
            "add",
            snapshot.scale
        );
        Object.assign(object.get(Health), snapshot.health);
        world.addObject(object);
        return;
    }

    const data = structuredClone(snapshot.data);
    data.moveDir = [0, 0];
    data.attacking = false;
    data.blocking = false;
    data.crafting = undefined;
    data.eating = undefined;
    unscaleRadius(physics, snapshot.scale);
    const object = new Player(physics, data);
    restoreObjectId(object, snapshot.id);
    Object.assign(object.get(Health), snapshot.health);
    Object.assign(object.get(Inventory), structuredClone(snapshot.inventory));
    const attributes = object.get(Attributes);
    attributes.types = structuredClone(snapshot.attributes);
    attributes.now = snapshot.attributeNow;
    physics.collisionRadius = snapshot.physics.collisionRadius;
    physics.collider.r = snapshot.physics.collisionRadius;
    object.get(Stats).types = structuredClone(snapshot.stats);
    world.addObject(object);
}

export function restoreDevCheckpoint(world: World): boolean {
    const target = filename();
    const restoring = `${target}.restoring`;
    fs.rmSync(restoring, { force: true });
    if (!fs.existsSync(target)) return false;
    fs.renameSync(target, restoring);
    const raw = JSON.parse(fs.readFileSync(restoring, "utf8")) as DevCheckpoint;
    if (raw.format !== 1 || !Array.isArray(raw.objects)) {
        throw new Error(`${target}: unsupported dev checkpoint`);
    }
    world.gameTime = raw.gameTime;
    for (const snapshot of raw.objects) restoreObject(world, snapshot);
    fs.rmSync(restoring);
    const players = raw.objects.filter((object) => object.kind === "player");
    console.log(
        `[dev] restored ${raw.objects.length} objects ` +
            `(${players.length} player sessions)`
    );
    return true;
}

