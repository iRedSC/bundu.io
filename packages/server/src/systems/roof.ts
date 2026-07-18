import { TileEntity, Type } from "../components/base.js";
import { BuildingConfigs } from "../configs/loaders/buildings.js";
import { System, type GameObject, type World } from "../engine";
import {
    setRoofGroupLookup,
    Structure,
} from "../game_objects/structure.js";
import { syncStructureStates } from "../network/object_state.js";
import { GameEvent, type GameEventMap } from "./event_map.js";

const ORTHO: readonly { x: number; y: number }[] = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
];

function isRoof(object: GameObject): boolean {
    const type = Type.get(object);
    if (!type || !TileEntity.get(object)) return false;
    return BuildingConfigs.get(type.id).class === "roof";
}

/**
 * Maintains connected roof groups (4-adjacent roof tiles) and syncs
 * `roofGroupId` on each roof for client-wide fade.
 */
export class RoofSystem extends System<GameEventMap> {
    private readonly groupByEntity = new Map<number, number>();
    private nextGroupId = 1;

    constructor(world: World) {
        // No per-object update — groups recompute on place/destroy.
        super(world, [TileEntity], 0);
        setRoofGroupLookup((id) => this.groupByEntity.get(id));
        this.listen(GameEvent.NewObject, this.onChange);
        this.listen(GameEvent.DeleteObject, this.onChange);
    }

    groupId(entityId: number): number | undefined {
        return this.groupByEntity.get(entityId);
    }

    private onChange = ({ object }: { object: GameObject }) => {
        if (isRoof(object) || this.groupByEntity.has(object.id)) {
            this.recompute();
        }
    };

    private recompute(): void {
        const roofs: GameObject[] = [];
        const tileToRoof = new Map<string, GameObject>();

        for (const object of this.world.objects.values()) {
            if (!object.active || !isRoof(object)) continue;
            roofs.push(object);
            const tile = object.get(TileEntity);
            for (const { x, y } of tile.occupied) {
                tileToRoof.set(`${x},${y}`, object);
            }
        }

        const parent = new Map<number, number>();
        const find = (id: number): number => {
            let root = id;
            while (parent.get(root) !== root) {
                root = parent.get(root) ?? root;
            }
            let cur = id;
            while (cur !== root) {
                const next = parent.get(cur) ?? cur;
                parent.set(cur, root);
                cur = next;
            }
            return root;
        };
        const union = (a: number, b: number) => {
            const ra = find(a);
            const rb = find(b);
            if (ra !== rb) parent.set(ra, rb);
        };

        for (const roof of roofs) {
            parent.set(roof.id, roof.id);
        }

        for (const roof of roofs) {
            const tile = roof.get(TileEntity);
            for (const { x, y } of tile.occupied) {
                for (const step of ORTHO) {
                    const neighbor = tileToRoof.get(
                        `${x + step.x},${y + step.y}`
                    );
                    if (neighbor && neighbor.id !== roof.id) {
                        union(roof.id, neighbor.id);
                    }
                }
            }
        }

        const rootToGroup = new Map<number, number>();
        const previous = new Map(this.groupByEntity);
        this.groupByEntity.clear();

        for (const roof of roofs) {
            const root = find(roof.id);
            let groupId = rootToGroup.get(root);
            if (groupId === undefined) {
                groupId = this.nextGroupId++;
                rootToGroup.set(root, groupId);
            }
            this.groupByEntity.set(roof.id, groupId);
            if (previous.get(roof.id) !== groupId && roof instanceof Structure) {
                syncStructureStates(this.world, roof);
            }
        }
    }
}
