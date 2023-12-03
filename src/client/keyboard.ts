import { Keystrokes } from "@rwh/keystrokes";

const keybinds = new Keystrokes({
    keyRemap: {
        w: "up",
        a: "left",
        s: "down",
        d: "right",
    },
});

export const move = [0, 0];

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
