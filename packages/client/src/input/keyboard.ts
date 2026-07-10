import { Keystrokes } from "@rwh/keystrokes";
import {
    axesFromPressedKeys,
    type MoveAxes,
} from "@bundu/shared";

export class KeyboardInputListener {
    keybinds: Keystrokes;
    chatOpen: boolean;

    private pressed = {
        up: false,
        down: false,
        left: false,
        right: false,
    };

    onMoveInput: (direction: MoveAxes) => void = () => {};
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

        const emitMove = () => {
            this.onMoveInput(axesFromPressedKeys(this.pressed));
        };

        this.keybinds.bindKey("up", {
            onPressed: () => {
                this.pressed.up = true;
                emitMove();
            },
            onReleased: () => {
                this.pressed.up = false;
                emitMove();
            },
        });
        this.keybinds.bindKey("left", {
            onPressed: () => {
                this.pressed.left = true;
                emitMove();
            },
            onReleased: () => {
                this.pressed.left = false;
                emitMove();
            },
        });
        this.keybinds.bindKey("down", {
            onPressed: () => {
                this.pressed.down = true;
                emitMove();
            },
            onReleased: () => {
                this.pressed.down = false;
                emitMove();
            },
        });
        this.keybinds.bindKey("right", {
            onPressed: () => {
                this.pressed.right = true;
                emitMove();
            },
            onReleased: () => {
                this.pressed.right = false;
                emitMove();
            },
        });

        this.keybinds.bindKey("chat", {
            onReleased: () => {
                // Enter in other inputs (e.g. username) must not toggle chat.
                const active = document.activeElement;
                if (
                    active instanceof HTMLInputElement &&
                    active.id !== "chat-input"
                ) {
                    return;
                }

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

    closeChat() {
        this.chatOpen = false;
        const chat = document.querySelector<HTMLInputElement>("#chat-input");
        if (chat) {
            chat.value = "";
            chat.blur();
        }
        document.querySelector(".chat-container")?.classList.add("hidden");
    }
}
