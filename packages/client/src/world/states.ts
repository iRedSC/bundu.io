import { lerp, rotationLerp } from "@bundu/shared";
import { serverTime } from "@client/globals";
import { movementProbe } from "./movement_probe";

export interface PositionState {
    x: number;
    y: number;
}

/**
 * Literal Suroi movement smoothing:
 * - old = previous packet *target* (not the mid-lerp visual)
 * - duration = raw measured inter-batch `serverTime.serverDt`
 * - t clamped to 1 (hold until the next packet)
 * No pad, no extrapolation, no duration clamping.
 */
export class PositionStates {
    private old: PositionState = { x: 0, y: 0 };
    private target: PositionState = { x: 0, y: 0 };
    private current: PositionState = { x: 0, y: 0 };
    private lastChange = 0;
    private hasTarget = false;
    /** Optional object id for movementProbe (debug hitch watcher). */
    probeId = -1;

    callback?: () => void;

    constructor(callback?: () => void) {
        this.callback = callback;
    }

    interpolate(now = serverTime.now()): { x: number; y: number } {
        if (!this.hasTarget) return this.current;

        const t = Math.min((now - this.lastChange) / serverTime.serverDt, 1);
        this.current = {
            x: lerp(this.old.x, this.target.x, t),
            y: lerp(this.old.y, this.target.y, t),
        };
        if (this.probeId >= 0) {
            movementProbe.noteLerp(this.probeId, t, false);
        }
        return this.current;
    }

    set(state: PositionState) {
        const span = this.hasTarget
            ? Math.hypot(state.x - this.target.x, state.y - this.target.y)
            : 0;

        if (this.hasTarget) {
            this.old = { x: this.target.x, y: this.target.y };
        } else {
            this.old = { x: state.x, y: state.y };
            this.current = { x: state.x, y: state.y };
        }
        this.target = { x: state.x, y: state.y };
        this.lastChange = serverTime.now();
        this.hasTarget = true;

        if (this.probeId >= 0) {
            movementProbe.notePos(
                this.probeId,
                span,
                serverTime.serverDt,
                this.lastChange
            );
        }
        this.callback?.();
    }

    isComplete(): boolean {
        if (!this.hasTarget) return true;
        return serverTime.now() - this.lastChange >= serverTime.serverDt;
    }
}

export type RotationState = number;

/** Same model as position: previous target → latest over raw serverDt. */
export class RotationStates {
    private last: RotationState = 0;
    private current: RotationState = 0;
    private next: RotationState = 0;
    private hasNext = false;
    callback?: () => void;

    private lastUpdateTime = serverTime.now();

    constructor(callback?: () => void) {
        this.callback = callback;
    }

    interpolate(): number {
        if (!this.hasNext) return this.last;

        const t = Math.min(
            (serverTime.now() - this.lastUpdateTime) / serverTime.serverDt,
            1
        );
        this.current = rotationLerp(this.last, this.next, t);
        return this.current;
    }

    isComplete(): boolean {
        if (!this.hasNext) return true;
        return serverTime.now() - this.lastUpdateTime >= serverTime.serverDt;
    }

    set(state: RotationState) {
        this.last = this.hasNext ? this.next : state;
        this.next = state;
        this.hasNext = true;
        this.lastUpdateTime = serverTime.now();
        this.callback?.();
    }

    /** Jump to a rotation with no interpolation (local look prediction). */
    snap(state: RotationState) {
        this.last = state;
        this.current = state;
        this.next = state;
        this.hasNext = true;
        this.lastUpdateTime = serverTime.now();
        this.callback?.();
    }
}
