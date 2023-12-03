import { Keystrokes } from "@rwh/keystrokes";
import { Player } from "./game_objects/player";

const keybinds = new Keystrokes({
    keyRemap: {
        w: "up",
        a: "left",
        s: "down",
        d: "right",
    },
});

export const move: [number, number] = [0, 0];
export let blocking = false;
export let attacking = false;
export let mousePos: [number, number] = [0, 0];

keybinds.bindKey("up", {
    onPressed: () => (move[1] += 1),
    onReleased: () => (move[1] -= 1),
});
keybinds.bindKey("left", {
    onPressed: () => (move[0] += 1),
    onReleased: () => (move[0] -= 1),
});
keybinds.bindKey("down", {
    onPressed: () => (move[1] -= 1),
    onReleased: () => (move[1] += 1),
});
keybinds.bindKey("right", {
    onPressed: () => (move[0] -= 1),
    onReleased: () => (move[0] += 1),
});

export function createClickEvents(player: Player) {
    document.body.addEventListener("mousemove", (event) => {
        mousePos[0] = event.clientX;
        mousePos[1] = event.clientY;
    });

    document.body.addEventListener("mousedown", (event) => {
        if (event.button == 2) {
            player.blocking = true;
            player.trigger("block");
        } else {
            attacking = true;
            player.trigger("attack");
        }
    });

    document.body.addEventListener("mouseup", (event) => {
        if (event.button == 2) {
            player.blocking = false;
        } else {
            attacking = false;
        }
    });
}
