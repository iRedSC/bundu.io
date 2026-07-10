import { lerp, rotationLerp } from "@bundu/shared";

/** Shared exponential-smoothing clock for position and rotation. */
const SMOOTHING_MS = 80;
const COMPLETE_EPSILON = 0.001;

function smoothT(elapsedMs: number): number {
    return 1 - Math.exp(-elapsedMs / SMOOTHING_MS);
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
    private lastFrameTime: number = performance.now();

    callback?: () => void;

    constructor(callback?: () => void) {
        this.callback = callback;
    }

    interpolate(now = performance.now()): { x: number; y: number } {
        if (!this.next) return this.last;

        const elapsed = Math.max(0, now - this.lastFrameTime);
        this.lastFrameTime = now;
        const t = smoothT(elapsed);

        this.current = {
            x: lerp(this.current.x, this.next.x, t),
            y: lerp(this.current.y, this.next.y, t),
        };
        return this.current;
    }

    set(state: PositionState, now = performance.now()) {
        if (!this.next) this.current = state;
        this.last = this.current;
        this.next = state;
        this.lastUpdateTime = now;
        this.lastFrameTime = now;
        this.callback?.();
    }

    isComplete(): boolean {
        return (
            !!this.next &&
            Math.abs(this.current.x - this.next.x) < COMPLETE_EPSILON &&
            Math.abs(this.current.y - this.next.y) < COMPLETE_EPSILON
        );
    }
}

export type RotationState = number;

export class RotationStates {
    private last: RotationState = 0;
    private current: RotationState = 0;
    private next?: RotationState;

    private lastUpdateTime: number = performance.now();
    private lastFrameTime: number = performance.now();

    callback?: () => void;

    constructor(callback?: () => void) {
        this.callback = callback;
    }

    interpolate(now = performance.now()): number {
        if (this.next === undefined) return this.last;

        const elapsed = Math.max(0, now - this.lastFrameTime);
        this.lastFrameTime = now;
        const t = smoothT(elapsed);

        this.current = rotationLerp(this.current, this.next, t);
        return this.current;
    }

    set(state: RotationState, now = performance.now()) {
        if (this.next === undefined) this.current = state;
        this.last = this.current;
        this.next = state;
        this.lastUpdateTime = now;
        this.lastFrameTime = now;
        this.callback?.();
    }

    isComplete(): boolean {
        if (this.next === undefined) return false;
        // Shortest angular distance (same wrap as rotationLerp)
        let delta = this.next - this.current;
        delta = ((delta + Math.PI) % (2 * Math.PI)) - Math.PI;
        if (delta > Math.PI) delta -= 2 * Math.PI;
        else if (delta < -Math.PI) delta += 2 * Math.PI;
        return Math.abs(delta) < COMPLETE_EPSILON;
    }
}
