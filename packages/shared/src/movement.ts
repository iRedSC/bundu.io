/** Server simulation / net flush rate. */
export const SERVER_TPS = 20;

/** Server movement / tick cadence (ms). */
export const SERVER_TICK_MS = 1000 / SERVER_TPS;

/** Client axis: 0 = negative, 1 = idle, 2 = positive. */
export type MoveAxis = 0 | 1 | 2;

/** Server velocity component after decode. */
export type MoveVectorComponent = -1 | 0 | 1;

export type MoveAxes = readonly [MoveAxis, MoveAxis];
export type MoveVector = readonly [MoveVectorComponent, MoveVectorComponent];

function clampAxis(value: number): MoveAxis {
    if (value <= 0) return 0;
    if (value >= 2) return 2;
    return 1;
}

/** Pack WASD axes into the Movement packet `direction` byte (1-based). */
export function encodeMoveDirection(x: number, y: number): number {
    const cx = clampAxis(x);
    const cy = clampAxis(y);
    return ((cx << 2) | cy) + 1;
}

/** Unpack Movement packet `direction` into a unit move vector. */
export function decodeMoveDirection(direction: number): MoveVector {
    const packed = direction - 1;
    const y = ((packed & 0b11) - 1) as MoveVectorComponent;
    const x = (((packed >> 2) & 0b11) - 1) as MoveVectorComponent;
    return [x, y];
}

/** Map pressed keys to client axes (opposing keys cancel to idle). */
export function axesFromPressedKeys(keys: {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
}): MoveAxes {
    // Server applies `position -= moveDir`, so left must encode as +x (axis 2).
    const x: MoveAxis =
        keys.left === keys.right ? 1 : keys.left ? 2 : 0;
    const y: MoveAxis = keys.up === keys.down ? 1 : keys.up ? 2 : 0;
    return [x, y];
}
