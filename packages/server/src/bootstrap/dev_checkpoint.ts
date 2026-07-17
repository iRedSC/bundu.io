import fs from "node:fs";
import path from "node:path";
import { Box, Circle, Vector } from "sat";
import type { GameObject, World } from "../engine";
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
    type AnimalData as AnimalState,
    type Health as HealthState,
    type TileEntity as TileEntityData,
} from "../components/base";
import { Attributes, type AttributesData } from "../components/attributes";
import { Inventory, type Inventory as InventoryData } from "../components/inventory";
import {
    clearEphemeralPlayerAttributeSources,
    clearEphemeralPlayerIntent,
    PlayerData,
    type PlayerData as PlayerState,
} from "../components/player";
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

/** Bumped when durable payloads change (AnimalData, full attributes). */
const FORMAT = 3;

type PhysicsSnapshot = {
    x: number;
    y: number;
    rotation: number;
    collisionRadius: number;
    speed: number;
};

type TileSnapshot = Omit<TileEntityData, "occupied">;
type BaseSnapshot = { id: number; physics: PhysicsSnapshot };
type AttributesSnapshot = {
    types: AttributesData["types"];
    now: number;
};

type CheckpointKind =
    | "ground"
    | "resource"
    | "structure"
    | "ground_item"
    | "animal"
    | "player";

type ObjectSnapshot =
    | ({
          kind: "ground";
          x: number;
          y: number;
          width: number;
          height: number;
          groundType: number;
          speedMultiplier: number;
      } & Pick<BaseSnapshot, "id">)
    | ({
          kind: "resource";
          type: number;
          variant?: string;
          tile?: TileSnapshot;
          scale: number;
          data: ResourceData;
          attributes: AttributesSnapshot;
      } & BaseSnapshot)
    | ({
          kind: "structure";
          type: number;
          variant?: string;
          tile: TileSnapshot;
          health: HealthState;
          door?: Door;
          rotting: boolean;
      } & BaseSnapshot)
    | ({ kind: "ground_item"; item: GroundItemData } & BaseSnapshot)
    | ({
          kind: "animal";
          type: number;
          variant?: string;
          health: HealthState;
          scale: number;
          data: AnimalState;
          attributes: AttributesSnapshot;
      } & BaseSnapshot)
    | ({
          kind: "player";
          data: PlayerState;
          health: HealthState;
          inventory: InventoryData;
          attributes: AttributesSnapshot;
          scale: number;
          stats: StatsData["types"];
      } & BaseSnapshot);

type DevCheckpoint = {
    format: typeof FORMAT;
    registryHash: string;
    gameTime: number;
    objects: ObjectSnapshot[];
};

type KindHandler<K extends CheckpointKind> = {
    kind: K;
    match(object: GameObject): boolean;
    snapshot(object: GameObject): Extract<ObjectSnapshot, { kind: K }>;
    restore(world: World, snapshot: Extract<ObjectSnapshot, { kind: K }>): void;
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

function snapshotAttributes(attributes: AttributesData): AttributesSnapshot {
    return {
        types: structuredClone(attributes.types),
        now: attributes.now,
    };
}

function restoreAttributes(
    attributes: AttributesData,
    snapshot: AttributesSnapshot
): void {
    attributes.types = structuredClone(snapshot.types);
    attributes.now = snapshot.now;
}

function applyPhysicsRadius(physics: Physics, radius: number): void {
    physics.collisionRadius = radius;
    physics.collider.r = radius;
}

/** `HealthSystem.enter` resets lastRegen — reapply after addObject. */
function addWithHealth(
    world: World,
    object: GameObject,
    health: HealthState
): void {
    world.addObject(object);
    Object.assign(object.get(Health), structuredClone(health));
}

function requirePhysics(object: GameObject): Physics {
    const physics = Physics.get(object);
    if (!physics) {
        throw new Error(`checkpoint: object ${object.id} missing Physics`);
    }
    return physics;
}

const groundHandler: KindHandler<"ground"> = {
    kind: "ground",
    match: (object) => object instanceof Ground,
    snapshot(object) {
        const ground = object.get(GroundData);
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
    },
    restore(world, snapshot) {
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
    },
};

const playerHandler: KindHandler<"player"> = {
    kind: "player",
    match: (object) => object instanceof Player,
    snapshot(object) {
        const physics = requirePhysics(object);
        const attributes = object.get(Attributes);
        return {
            kind: "player",
            id: object.id,
            physics: physicsSnapshot(physics),
            data: structuredClone(object.get(PlayerData)),
            health: structuredClone(object.get(Health)),
            inventory: structuredClone(object.get(Inventory)),
            attributes: snapshotAttributes(attributes),
            scale: attributes.get("physics.scale"),
            stats: structuredClone(object.get(Stats).types),
        };
    },
    restore(world, snapshot) {
        const data = structuredClone(snapshot.data);
        clearEphemeralPlayerIntent(data);
        const physics = restorePhysics(snapshot.physics);
        unscaleRadius(physics, snapshot.scale);
        const object = new Player(physics, data);
        restoreObjectId(object, snapshot.id);
        Object.assign(object.get(Inventory), structuredClone(snapshot.inventory));
        const attributes = object.get(Attributes);
        restoreAttributes(attributes, snapshot.attributes);
        // Intent wiped above; drop block/eat modifiers that came back with attrs.
        clearEphemeralPlayerAttributeSources(attributes);
        applyPhysicsRadius(physics, snapshot.physics.collisionRadius);
        object.get(Stats).types = structuredClone(snapshot.stats);
        // Sockets / VisibleObjects stay ephemeral — never restored.
        addWithHealth(world, object, snapshot.health);
    },
};

const animalHandler: KindHandler<"animal"> = {
    kind: "animal",
    match: (object) => object instanceof Animal,
    snapshot(object) {
        const physics = requirePhysics(object);
        const type = object.get(Type);
        const attributes = object.get(Attributes);
        return {
            kind: "animal",
            id: object.id,
            physics: physicsSnapshot(physics),
            type: type.id,
            variant: type.variant,
            health: structuredClone(object.get(Health)),
            scale: attributes.get("physics.scale"),
            data: structuredClone(object.get(AnimalData)),
            attributes: snapshotAttributes(attributes),
        };
    },
    restore(world, snapshot) {
        const physics = restorePhysics(snapshot.physics);
        unscaleRadius(physics, snapshot.scale);
        const object = new Animal(
            { id: snapshot.type, variant: snapshot.variant },
            physics
        );
        restoreObjectId(object, snapshot.id);
        Object.assign(object.get(AnimalData), structuredClone(snapshot.data));
        restoreAttributes(object.get(Attributes), snapshot.attributes);
        applyPhysicsRadius(physics, snapshot.physics.collisionRadius);
        addWithHealth(world, object, snapshot.health);
    },
};

const groundItemHandler: KindHandler<"ground_item"> = {
    kind: "ground_item",
    match: (object) => object instanceof GroundItem,
    snapshot(object) {
        return {
            kind: "ground_item",
            id: object.id,
            physics: physicsSnapshot(requirePhysics(object)),
            item: structuredClone(object.get(GroundItemData)),
        };
    },
    restore(world, snapshot) {
        const object = new GroundItem(
            restorePhysics(snapshot.physics),
            structuredClone(snapshot.item)
        );
        restoreObjectId(object, snapshot.id);
        world.addObject(object);
    },
};

const resourceHandler: KindHandler<"resource"> = {
    kind: "resource",
    match: (object) => object instanceof Resource,
    snapshot(object) {
        const physics = requirePhysics(object);
        const type = object.get(Type);
        const tile = TileEntity.get(object);
        const attributes = object.get(Attributes);
        return {
            kind: "resource",
            id: object.id,
            physics: physicsSnapshot(physics),
            type: type.id,
            variant: type.variant,
            tile: tile && tileSnapshot(tile),
            scale: attributes.get("physics.scale"),
            data: structuredClone(object.get(ResourceData)),
            attributes: snapshotAttributes(attributes),
        };
    },
    restore(world, snapshot) {
        const physics = restorePhysics(snapshot.physics);
        unscaleRadius(physics, snapshot.scale);
        const object = new Resource(
            physics,
            { id: snapshot.type, variant: snapshot.variant },
            snapshot.tile && restoreTile(snapshot.tile),
            snapshot.scale
        );
        restoreObjectId(object, snapshot.id);
        world.addObject(object);
        // ResourceSystem.enter reseeds lastRegen/decayAt — durable data wins.
        Object.assign(object.get(ResourceData), structuredClone(snapshot.data));
        restoreAttributes(object.get(Attributes), snapshot.attributes);
        applyPhysicsRadius(physics, snapshot.physics.collisionRadius);
    },
};

const structureHandler: KindHandler<"structure"> = {
    kind: "structure",
    match: (object) => object instanceof Structure,
    snapshot(object) {
        const type = object.get(Type);
        return {
            kind: "structure",
            id: object.id,
            physics: physicsSnapshot(requirePhysics(object)),
            type: type.id,
            variant: type.variant,
            tile: tileSnapshot(object.get(TileEntity)),
            health: structuredClone(object.get(Health)),
            door: structuredClone(Door.get(object)),
            rotting: Rotting.get(object) !== undefined,
        };
    },
    restore(world, snapshot) {
        const object = new Structure(
            restorePhysics(snapshot.physics),
            { id: snapshot.type, variant: snapshot.variant },
            restoreTile(snapshot.tile)
        );
        restoreObjectId(object, snapshot.id);
        if (snapshot.door) Object.assign(object.get(Door), snapshot.door);
        if (snapshot.rotting) object.add(new Rotting());
        addWithHealth(world, object, snapshot.health);
        // PositionSystem.enter always occupies; open doors must release.
        if (snapshot.door?.open) {
            world.context.occupancy.release(object.id);
        }
    },
};

/** Exhaustive: missing kind → compile error. */
const HANDLERS: { [K in CheckpointKind]: KindHandler<K> } = {
    ground: groundHandler,
    player: playerHandler,
    animal: animalHandler,
    ground_item: groundItemHandler,
    resource: resourceHandler,
    structure: structureHandler,
};

const MATCH_ORDER = Object.values(HANDLERS);

function snapshotObject(object: GameObject): ObjectSnapshot {
    for (const handler of MATCH_ORDER) {
        if (handler.match(object)) return handler.snapshot(object);
    }
    throw new Error(
        `checkpoint: unregistered object id=${object.id} ` +
            `(add a KindHandler before introducing new GameObject types)`
    );
}

function restoreObject(world: World, snapshot: ObjectSnapshot): void {
    switch (snapshot.kind) {
        case "ground":
            HANDLERS.ground.restore(world, snapshot);
            return;
        case "player":
            HANDLERS.player.restore(world, snapshot);
            return;
        case "animal":
            HANDLERS.animal.restore(world, snapshot);
            return;
        case "ground_item":
            HANDLERS.ground_item.restore(world, snapshot);
            return;
        case "resource":
            HANDLERS.resource.restore(world, snapshot);
            return;
        case "structure":
            HANDLERS.structure.restore(world, snapshot);
            return;
        default: {
            const _never: never = snapshot;
            throw new Error(
                `checkpoint: unknown kind ${(_never as ObjectSnapshot).kind}`
            );
        }
    }
}

export function saveDevCheckpoint(world: World, registryHash: string): void {
    const target = filename();
    const checkpoint: DevCheckpoint = {
        format: FORMAT,
        registryHash,
        gameTime: world.gameTime,
        // Alive objects only (soft-disconnected players stay active).
        objects: [...world.objects.values()]
            .filter((object) => object.active)
            .map(snapshotObject),
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

export function restoreDevCheckpoint(
    world: World,
    registryHash: string
): boolean {
    const target = filename();
    const restoring = `${target}.restoring`;
    fs.rmSync(restoring, { force: true });
    if (!fs.existsSync(target)) return false;
    fs.renameSync(target, restoring);
    const raw = JSON.parse(fs.readFileSync(restoring, "utf8")) as DevCheckpoint;
    if (
        raw.format !== FORMAT ||
        raw.registryHash !== registryHash ||
        !Array.isArray(raw.objects)
    ) {
        fs.rmSync(restoring);
        console.warn(
            `[dev] ignored incompatible checkpoint ` +
                `(format ${String(raw.format)}, registry ${String(raw.registryHash)})`
        );
        return false;
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
