import { Random } from "../lib/random";
import { Player } from "./game_objects/player";

const items = [
    "wooden_sword",
    "gold_sword",
    "amethyst_sword",
    "stone_pickaxe",
    "diamond_pickaxe",
    "wooden_pickaxe",
];

const helmets = [
    "wooden_helmet",
    "gold_helmet",
    "amethyst_helmet",
    "stone_helmet",
    "diamond_helmet",
];

export function createSwitch(player: Player) {
    const switchCheckbox =
        document.querySelector<HTMLInputElement>("label.switch input")!;

    switchCheckbox.addEventListener("click", function () {
        if (switchCheckbox.checked) {
            player.selectItem({
                hand: Random.choose(items),
                body: Random.choose(helmets),
            });
        } else {
            player.selectItem({
                hand: Random.choose(items),
                body: Random.choose(helmets),
            });
        }
    });
}
