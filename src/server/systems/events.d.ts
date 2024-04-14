import { GameObject } from "../game_engine/game_object";

export type HurtEvent = {
    source: GameObject;
    damage: number;
};

export type SpawnItemEvent = {
    id: number;
    amount: number;
};
