import typia from "typia";
import { lerp, rotationLerp } from "@ioengine/lib";
import { serverTime } from "@client/globals";
import { drawLine } from "@client/rendering/debug";

const DEBUG_MODE = true;

function debugLog(...data: any[]) {
    if (!DEBUG_MODE) return;
    console.log(...data);
}

export interface PositionState {
    x: number;
    y: number;
}

export class PositionStates {
    private last: PositionState = { x: 0, y: 0 };
    private current: PositionState = this.last;
    private next?: PositionState;

    private lastUpdateTime: number = performance.now();
    private readonly updateIntervalMs = 150; // period between updates

    callback?: () => void;

    constructor(callback?: () => void) {
        this.callback = callback;
    }

    interpolate(): { x: number; y: number } {
        if (!this.next) return this.last;

        const now = performance.now();
        const elapsed = now - this.lastUpdateTime;
        const t = Math.min(elapsed / this.updateIntervalMs, 1); // clamp [0,1]
        // if (t === 1)
        //     console.log(`t=${t.toFixed(3)}, elapsed=${elapsed.toFixed(1)}`);
        drawLine(this.last, this.next);

        this.current = {
            x: lerp(this.current.x, this.next.x, 0.05),
            y: lerp(this.current.y, this.next.y, 0.05),
        };
        return this.current;
    }

    set(state: PositionState) {
        if (!typia.is<PositionState>(state)) return;

        if (!this.next) this.current = state;
        this.last = this.current;
        this.next = state;
        this.lastUpdateTime = performance.now();

        this.callback?.();
    }

    isComplete(): boolean {
        return (
            !!this.next &&
            Math.abs(this.current.x - this.next.x) < 0.001 &&
            Math.abs(this.current.y - this.next.y) < 0.001
        );
    }

    private debugInfo() {
        const now = performance.now();
        const interval = now - this.lastUpdateTime;
        console.log(
            `Update interval: ${interval.toFixed(2)}ms (expected ${
                this.updateIntervalMs
            }ms)`
        );
    }
}

export type RotationState = number;

export class RotationStates {
    private last: RotationState = 0;
    private current: RotationState = 0;
    private next: RotationState = 0;
    callback?: () => void;

    private lastUpdateTime: number = performance.now();
    private readonly updateIntervalMs = 50;

    constructor(callback?: () => void) {
        this.callback = callback;
    }

    interpolate(): number {
        if (!this.next) return this.last;

        const now = performance.now();
        const elapsed = now - this.lastUpdateTime;
        const t = Math.min(elapsed / this.updateIntervalMs, 1); // clamp [0,1]

        this.current = rotationLerp(this.last, this.next, t);
        return this.current;
    }

    isComplete(): boolean {
        // return !!this.next && Math.abs(this.current - this.next) < 0.001;
        return false;
    }

    set(state: RotationState) {
        if (!typia.is<RotationState>(state)) return;
        this.last = this.next;
        this.next = state;
        this.lastUpdateTime = performance.now();
        this.callback?.();
    }
}
