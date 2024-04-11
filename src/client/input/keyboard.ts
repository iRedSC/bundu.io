import { Keystrokes } from "@rwh/keystrokes";

export class KeyboardInputListener {
    keybinds: Keystrokes;
    move: [number, number];
    chatOpen: boolean;

    constructor(moveCallback: Function, chatCallback: Function) {
        this.keybinds = new Keystrokes({
            keyRemap: {
                w: "up",
                a: "left",
                s: "down",
                d: "right",
                enter: "chat",
            },
        });

        this.chatOpen = false;
        this.move = [1, 1];

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

        this.keybinds.bindKey("chat", {
            onReleased: () => {
                this.chatOpen = !this.chatOpen;
                if (this.chatOpen === true) {
                    document
                        .querySelector(".chat-container")
                        ?.classList.remove("hidden");
                    document
                        .querySelector<HTMLInputElement>("#chat-input")
                        ?.focus();
                    return;
                }
                const chat =
                    document.querySelector<HTMLInputElement>("#chat-input");
                if (chat) {
                    chatCallback(chat.value);
                    chat.value = "";
                }
                document
                    .querySelector(".chat-container")
                    ?.classList.add("hidden");
            },
        });
    }
}
