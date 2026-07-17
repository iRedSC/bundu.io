import { getNumericId } from "@bundu/shared/id_map.js";
import { Attributes, type AttributesData } from "../components/attributes.js";
import { Physics, TileEntity, Type } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { gameplayConfig } from "../configs/gameplay.js";
import { type GameObject, System, type World } from "../engine";
import type { GameEventMap } from "./event_map.js";
import { getSizedBounds } from "./position.js";

const SOURCE = "near_fire";

/**
 * Grants temperature.warmth while a connected player stands near a fire structure.
 * Takes the strongest in-range fire; does not stack. TemperatureSystem integrates it.
 */
export class NearFireSystem extends System<GameEventMap> {
    private warmthById: Map<number, number> | undefined;

    constructor(world: World) {
        super(world, [PlayerData, Attributes, Physics], 5);
    }

    override update(_time: number, _delta: number, player: GameObject): void {
        const attributes = player.get(Attributes);
        if (!this.world.context.socketManager.getSocket(player.id)) {
            this.clearWarmth(attributes);
            return;
        }

        const warmth = this.strongestNearbyWarmth(player);
        this.applyWarmth(attributes, warmth);
    }

    override exit(player: GameObject): void {
        const attributes = Attributes.get(player);
        if (attributes) this.clearWarmth(attributes);
    }

    private strongestNearbyWarmth(player: GameObject): number {
        const { radius, warmthByStructure } =
            gameplayConfig().temperature.nearFire;
        const warmthById = this.resolveWarmthIds(warmthByStructure);
        if (warmthById.size === 0) return 0;

        const origin = player.get(Physics).position;
        const candidates = this.world.query(
            [TileEntity, Physics, Type],
            this.world.context.quadtree.query(
                getSizedBounds(origin, radius, radius)
            )
        );

        let best = 0;
        for (const structure of candidates) {
            const warmth = warmthById.get(structure.get(Type).id);
            if (warmth === undefined || warmth <= best) continue;
            const pos = structure.get(Physics).position;
            if (Math.hypot(pos.x - origin.x, pos.y - origin.y) > radius) {
                continue;
            }
            best = warmth;
        }
        return best;
    }

    private resolveWarmthIds(
        warmthByStructure: Record<string, number>
    ): Map<number, number> {
        if (this.warmthById) return this.warmthById;
        const resolved = new Map<number, number>();
        for (const [name, warmth] of Object.entries(warmthByStructure)) {
            const id = getNumericId(name);
            if (id === undefined) {
                throw new Error(
                    `gameplay.temperature.near_fire.warmth: unknown id "${name}"`
                );
            }
            resolved.set(id, warmth);
        }
        this.warmthById = resolved;
        return resolved;
    }

    private applyWarmth(attributes: AttributesData, warmth: number): void {
        const existing = attributes.types["temperature.warmth"]?.[SOURCE];
        if (warmth <= 0) {
            if (existing) attributes.clear(SOURCE, "temperature.warmth");
            return;
        }
        if (existing?.operation === "add" && existing.value === warmth) return;
        attributes.set("temperature.warmth", SOURCE, "add", warmth);
    }

    private clearWarmth(attributes: AttributesData): void {
        if (attributes.types["temperature.warmth"]?.[SOURCE]) {
            attributes.clear(SOURCE, "temperature.warmth");
        }
    }
}
