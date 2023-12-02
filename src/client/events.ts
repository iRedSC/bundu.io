import { Player } from "./game_objects/player";

export let block = false;
export let mousePos = [0, 0];

export function createEvents(player: Player) {
    document.body.addEventListener("mousemove", (e) => {
        mousePos[0] = e.clientX;
        mousePos[1] = e.clientY;
    });

    let attack = false;
    let clicked = false;

    setInterval(() => {
        if ((attack || clicked) && !block) {
            player.trigger("attack");
            clicked = false;
        }
    }, 100);

    setInterval(() => {
        if (block) {
            player.trigger("block");
        }
    }, 100);

    document.body.addEventListener("mousedown", (event) => {
        if (event.button == 2) {
            block = true;
        } else {
            attack = true;
        }
    });

    document.body.addEventListener("click", (event) => {
        if (event.button == 0) {
            clicked = true;
        }
    });

    document.body.addEventListener("mouseup", (event) => {
        if (event.button == 2) {
            block = false;
        } else {
            attack = false;
        }
    });
}
