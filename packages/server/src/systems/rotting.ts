import { getNumericId } from "@bundu/shared/id_map.js";
import { Health, Rotting, TileEntity } from "../components/base.js";
import { PlayerData } from "../components/player.js";
import { type GameObject, System, type World } from "../engine";
import { Structure } from "../game_objects/structure.js";
import { syncStructureStates } from "../network/object_state.js";
import { GameEvent, type GameEventMap } from "./event_map.js";
import { gameplayConfig } from "../configs/gameplay.js";

/** Marks a dead player's structures as claimable and decays them over time. */
export class RottingSystem extends System<GameEventMap> {
    constructor(world: World) {
        super(world, [Rotting, Health], 1);
        this.listen(GameEvent.Kill, this.ownerDied, [PlayerData]);
        this.listen(GameEvent.Hurt, this.claim, [Rotting, TileEntity]);
    }

    override update(_time: number, _delta: number, structure: GameObject): void {
        this.trigger(GameEvent.Hurt, {
            object: structure,
            damage: gameplayConfig().rotting.damagePerSecond,
        });
    }

    private ownerDied = ({ object: player }: GameEvent.Kill): void => {
        for (const structure of this.world.query([Health, TileEntity])) {
            if (!(structure instanceof Structure)) continue;
            const tile = structure.get(TileEntity);
            if (tile.ownerId !== player.id || Rotting.get(structure)) continue;

            tile.ownerId = undefined;
            structure.add(new Rotting());
            syncStructureStates(this.world, structure);
        }
    };

    /** Diamond-sword hits on rotting structures transfer ownership (after Hurt). */
    private claim = ({
        object,
        source,
        weapon,
    }: GameEvent.Hurt): void => {
        if (!source || !object.active) return;
        const claimWeapon = getNumericId(gameplayConfig().rotting.claimWeapon);
        if (weapon !== claimWeapon || !Rotting.get(object)) return;

        const tile = TileEntity.get(object);
        if (!tile) return;

        object.remove(Rotting);
        tile.ownerId = source.id;
        syncStructureStates(this.world, object);
    };
}
