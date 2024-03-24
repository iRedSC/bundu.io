import { Keystrokes } from "@rwh/keystrokes";

export let attacking = false;
export let mousePos: [number, number] = [0, 0];

export class InputHandler {
    keybinds: Keystrokes;
    move: [number, number];
    mousePos: [number, number];

    constructor(moveCallback: Function, mouseMoveCallback: Function) {
        this.keybinds = new Keystrokes({
            keyRemap: {
                w: "up",
                a: "left",
                s: "down",
                d: "right",
            },
        });
        this.move = [0, 0];
        this.mousePos = [0, 0];

        this.keybinds.bindKey("up", {
            onPressed: () => {
                this.move[1] += 1;
                moveCallback(this.move);
            },
            onReleased: () => {
                this.move[1] -= 1;
                moveCallback(this.move);
            },
        });
        this.keybinds.bindKey("left", {
            onPressed: () => {
                this.move[0] += 1;
                moveCallback(this.move);
            },
            onReleased: () => {
                this.move[0] -= 1;
                moveCallback(this.move);
            },
        });
        this.keybinds.bindKey("down", {
            onPressed: () => {
                this.move[1] -= 1;
                moveCallback(this.move);
            },
            onReleased: () => {
                this.move[1] += 1;
                moveCallback(this.move);
            },
        });
        this.keybinds.bindKey("right", {
            onPressed: () => {
                this.move[0] -= 1;
                moveCallback(this.move);
            },
            onReleased: () => {
                this.move[0] += 1;
                moveCallback(this.move);
            },
        });

        document.body.addEventListener("mousemove", (event) => {
            this.mousePos[0] = event.clientX;
            this.mousePos[1] = event.clientY;
            mouseMoveCallback(this.mousePos);
        });

        document.body.addEventListener("touchmove", (event) => {
            this.mousePos[0] = event.touches[0].clientX;
            this.mousePos[1] = event.touches[0].clientY;
            mouseMoveCallback(this.mousePos);
        });
    }
}
