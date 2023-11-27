export let actions: any = {};
actions.move = {};

interface KeyPresses {
    Shift: boolean;
    r: boolean;
    w: boolean;
    a: boolean;
    s: boolean;
    d: boolean;
    [key: string]: any;
}

let keys: KeyPresses = {
    Shift: false,
    r: false,
    w: false,
    a: false,
    s: false,
    d: false,
};

function keypress(key: KeyboardEvent) {
    keys[key.key] = true;
}

function keyrelease(key: KeyboardEvent) {
    keys[key.key] = false;
}

export function moveInputs(): [number, number] {
    let pos: [number, number] = [0, 0];
    if (keys["w"]) {
        pos[1] += 1;
    }
    if (keys["a"]) {
        pos[0] += 1;
    }
    if (keys["s"]) {
        pos[1] -= 1;
    }
    if (keys["d"]) {
        pos[0] -= 1;
    }
    return pos;
}

window.addEventListener("keydown", keypress, false);
window.addEventListener("keyup", keyrelease, false);
