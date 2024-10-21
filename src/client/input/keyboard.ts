import { Keystrokes } from "@rwh/keystrokes";

type MoveDir = 0 | 1 | 2;
export class KeyboardInputListener {
    keybinds: Keystrokes;
    move: [MoveDir, MoveDir];
    chatOpen: boolean;

    onMoveInput: (direction: [MoveDir, MoveDir]) => void = () => {};
    onSendChat: (message: string) => void = () => {};

    constructor() {
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
                this.onMoveInput(this.move);
            },
            onReleased: () => {
                this.move[1] -= 1;
                this.onMoveInput(this.move);
            },
        });
        this.keybinds.bindKey("left", {
            onPressed: () => {
                this.move[0] += 1;
                this.onMoveInput(this.move);
            },
            onReleased: () => {
                this.move[0] -= 1;
                this.onMoveInput(this.move);
            },
        });
        this.keybinds.bindKey("down", {
            onPressed: () => {
                this.move[1] -= 1;
                this.onMoveInput(this.move);
            },
            onReleased: () => {
                this.move[1] += 1;
                this.onMoveInput(this.move);
            },
        });
        this.keybinds.bindKey("right", {
            onPressed: () => {
                this.move[0] -= 1;
                this.onMoveInput(this.move);
            },
            onReleased: () => {
                this.move[0] += 1;
                this.onMoveInput(this.move);
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
                    this.onSendChat(chat.value);
                    chat.value = "";
                }
                document
                    .querySelector(".chat-container")
                    ?.classList.add("hidden");
            },
        });
    }
}
