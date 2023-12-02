import { Random } from "../lib/random";
import { Player } from "./game_objects/player";

const items = [
    "wooden_sword",
    "gold_sword",
    "amethyst_sword",
    "stone_pickaxe",
    "diamond_pickaxe",
];

export function createSwitch(player: Player) {
    const switchCheckbox =
        document.querySelector<HTMLInputElement>("label.switch input")!;

    switchCheckbox.addEventListener("click", function () {
        if (switchCheckbox.checked) {
            player.selectItem({ hand: Random.choose(items) });
        } else {
            player.selectItem({ hand: Random.choose(items) });
        }
    });
}
