import { lerp, rotationLerp } from "@bundu/shared";
import { serverTime } from "@client/globals";

export interface PositionState {
    x: number;
    y: number;
}

export class PositionStates {
    private last: PositionState = { x: 0, y: 0 };
    private current: PositionState = this.last;
    private next?: PositionState;

    private lastUpdateTime: number = serverTime.now();
    private lastFrameTime: number = serverTime.now();
    private readonly smoothingMs = 80;

    callback?: () => void;

    constructor(callback?: () => void) {
        this.callback = callback;
    }

    interpolate(now = serverTime.now()): { x: number; y: number } {
        if (!this.next) return this.last;

        const elapsed = Math.max(0, now - this.lastFrameTime);
        this.lastFrameTime = now;
        const t = 1 - Math.exp(-elapsed / this.smoothingMs);

        this.current = {
            x: lerp(this.current.x, this.next.x, t),
            y: lerp(this.current.y, this.next.y, t),
        };
        return this.current;
    }

    set(state: PositionState) {
        if (!this.next) this.current = state;
        this.last = this.current;
        this.next = state;
        this.lastUpdateTime = serverTime.now();
        this.lastFrameTime = this.lastUpdateTime;
        this.callback?.();
    }

    isComplete(): boolean {
        return (
            !!this.next &&
            Math.abs(this.current.x - this.next.x) < 0.001 &&
            Math.abs(this.current.y - this.next.y) < 0.001
        );
    }
}

export type RotationState = number;

export class RotationStates {
    private last: RotationState = 0;
    private current: RotationState = 0;
    private next: RotationState = 0;
    callback?: () => void;

    private lastUpdateTime: number = serverTime.now();
    private readonly updateIntervalMs = 50;

    constructor(callback?: () => void) {
        this.callback = callback;
    }

    interpolate(): number {
        if (!this.next) return this.last;

        const now = serverTime.now();
        const elapsed = now - this.lastUpdateTime;
        const t = Math.min(elapsed / this.updateIntervalMs, 1);

        this.current = rotationLerp(this.last, this.next, t);
        return this.current;
    }

    isComplete(): boolean {
        const elapsed = serverTime.now() - this.lastUpdateTime;
        return elapsed >= this.updateIntervalMs;
    }

    set(state: RotationState) {
        this.last = this.next;
        this.next = state;
        this.lastUpdateTime = serverTime.now();
        this.callback?.();
    }
}
