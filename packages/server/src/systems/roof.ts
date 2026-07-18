import { TileEntity, Type } from "../components/base.js";
import { BuildingConfigs } from "../configs/loaders/buildings.js";
import { System, type GameObject, type World } from "../engine";
import {
    setRoofGroupLookup,
    Structure,
} from "../game_objects/structure.js";
import { syncStructureStates } from "../network/object_state.js";
import { GameEvent, type GameEventMap } from "./event_map.js";
import {
    adjacentRoofIds,
    haloConnectsStumps,
    splitComponentsAfterDelete,
    stumpTiles,
    type RoofTileIndex,
} from "./roof_connectivity.js";

function isRoof(object: GameObject): boolean {
    const type = Type.get(object);
    if (!type || !TileEntity.get(object)) return false;
    return BuildingConfigs.get(type.id).class === "roof";
}

/**
 * Incremental roof groups (4-adjacent).
 *
 * Place: join 0 → new id; 1 → that group; 2+ → max id, absorb the rest.
 * Delete: leaf/halo early-outs, else stump flood; splits get fresh larger ids.
 */
export class RoofSystem extends System<GameEventMap> {
    private readonly groupByEntity = new Map<number, number>();
    private readonly membersByGroup = new Map<number, Set<number>>();
    private nextGroupId = 1;

    constructor(world: World) {
        super(world, [TileEntity], 0);
        setRoofGroupLookup((id) => this.groupByEntity.get(id));
        this.listen(GameEvent.NewObject, this.onNew);
        this.listen(GameEvent.DeleteObject, this.onDelete);
    }

    groupId(entityId: number): number | undefined {
        return this.groupByEntity.get(entityId);
    }

    private readonly index: RoofTileIndex = {
        roofAt: (x, y) => this.world.context.occupancy.get(x, y, "roof"),
        footprint: (entityId) => {
            const object = this.world.getObject(entityId);
            const tile = object ? TileEntity.get(object) : undefined;
            return tile?.occupied ?? [];
        },
    };

    private onNew = ({ object }: GameEvent.NewObject) => {
        if (!isRoof(object)) return;
        this.placeRoof(object);
    };

    private onDelete = ({ object }: GameEvent.DeleteObject) => {
        if (!this.groupByEntity.has(object.id)) return;
        this.deleteRoof(object);
    };

    private placeRoof(object: GameObject): void {
        const tile = TileEntity.get(object);
        if (!tile) return;

        const neighborIds = adjacentRoofIds(
            this.index,
            tile.occupied,
            object.id
        );
        const neighborGroups = new Set<number>();
        for (const id of neighborIds) {
            let groupId = this.groupByEntity.get(id);
            // Safety: every occupied neighbor should already be grouped.
            if (groupId === undefined) {
                groupId = this.nextGroupId++;
                this.assign(id, groupId);
            }
            neighborGroups.add(groupId);
        }

        if (neighborGroups.size === 0) {
            const groupId = this.nextGroupId++;
            this.assign(object.id, groupId);
            return;
        }

        let survivor = 0;
        for (const groupId of neighborGroups) {
            if (groupId > survivor) survivor = groupId;
        }

        for (const groupId of neighborGroups) {
            if (groupId !== survivor) this.mergeGroupInto(groupId, survivor);
        }

        this.assign(object.id, survivor);
    }

    private deleteRoof(object: GameObject): void {
        const groupId = this.groupByEntity.get(object.id);
        if (groupId === undefined) return;

        const tile = TileEntity.get(object);
        const footprint = tile?.occupied ?? [];

        this.unassign(object.id);

        const members = this.membersByGroup.get(groupId);
        if (!members || members.size === 0) {
            this.membersByGroup.delete(groupId);
            return;
        }
        if (members.size === 1) return;

        const stumps = stumpTiles(
            this.index,
            footprint,
            members,
            object.id
        );

        // 0–1 stumps: leaf / non-bridge. Halo: local reconnect. Else flood.
        if (stumps.length <= 1) return;
        if (haloConnectsStumps(this.index, footprint, members, stumps)) {
            return;
        }

        const components = splitComponentsAfterDelete(
            this.index,
            members,
            stumps
        );
        if (!components) return;

        // Keep the first component on the old id; retag the rest with new ids.
        for (let i = 1; i < components.length; i++) {
            const component = components[i];
            if (!component) continue;
            const newId = this.nextGroupId++;
            for (const entityId of component) {
                this.assign(entityId, newId);
            }
        }
    }

    private mergeGroupInto(from: number, into: number): void {
        if (from === into) return;
        const members = this.membersByGroup.get(from);
        if (!members) return;
        for (const entityId of [...members]) {
            this.assign(entityId, into);
        }
        this.membersByGroup.delete(from);
    }

    private assign(entityId: number, groupId: number): void {
        const previous = this.groupByEntity.get(entityId);
        if (previous === groupId) return;

        if (previous !== undefined) {
            const prevMembers = this.membersByGroup.get(previous);
            prevMembers?.delete(entityId);
            if (prevMembers && prevMembers.size === 0) {
                this.membersByGroup.delete(previous);
            }
        }

        this.groupByEntity.set(entityId, groupId);
        let members = this.membersByGroup.get(groupId);
        if (!members) {
            members = new Set();
            this.membersByGroup.set(groupId, members);
        }
        members.add(entityId);

        const object = this.world.getObject(entityId);
        if (object instanceof Structure && object.active) {
            syncStructureStates(this.world, object);
        }
    }

    private unassign(entityId: number): void {
        const groupId = this.groupByEntity.get(entityId);
        if (groupId === undefined) return;
        this.groupByEntity.delete(entityId);
        const members = this.membersByGroup.get(groupId);
        members?.delete(entityId);
        if (members && members.size === 0) {
            this.membersByGroup.delete(groupId);
        }
    }
}
