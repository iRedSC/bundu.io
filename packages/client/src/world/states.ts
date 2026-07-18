import { SERVER_TICK_MS, rotationLerp } from "@bundu/shared";
import { clientTime } from "@client/globals";

export interface PositionState {
    x: number;
    y: number;
}

/** Unclamped lerp — t>1 extrapolates along the same segment. */
function mix(a: number, b: number, t: number): number {
    return a + (b - a) * t;
}

/**
 * Mild pad over one tick so late packets don't freeze at the target,
 * plus a short coast (t>1) so motion stays continuous.
 */
const INTERP_MS = SERVER_TICK_MS * 1.05;
/** How far past the target we may coast (fraction of a tick). */
const EXTRAP = 0.6;

/**
 * Entity interpolation: visual → latest over a fixed duration.
 * Coast briefly if the next packet is late.
 */
export class PositionStates {
    private from: PositionState = { x: 0, y: 0 };
    private to: PositionState = { x: 0, y: 0 };
    private current: PositionState = { x: 0, y: 0 };
    private startedAt = 0;
    private hasSegment = false;
    private readonly maxExtrapolate: number;

    callback?: () => void;

    constructor(
        callback?: () => void,
        private readonly interpolationMS = INTERP_MS,
        /** How far past the target we may coast (fraction of the interval). */
        maxExtrapolate: number = EXTRAP
    ) {
        this.callback = callback;
        this.maxExtrapolate = maxExtrapolate;
    }

    get position(): PositionState {
        return this.current;
    }

    interpolate(now = clientTime.now()): { x: number; y: number } {
        if (!this.hasSegment) return this.current;

        const t = Math.min(
            (now - this.startedAt) / this.interpolationMS,
            1 + this.maxExtrapolate
        );
        this.current = {
            x: mix(this.from.x, this.to.x, t),
            y: mix(this.from.y, this.to.y, t),
        };
        return this.current;
    }

    set(state: PositionState, now = clientTime.now()) {
        if (!this.hasSegment) {
            this.snap(state);
            return;
        }

        // Always continue from the rendered position. Resetting to `to` after
        // coasting makes the first packet after standing still visibly snap back.
        this.interpolate(now);
        this.from = { x: this.current.x, y: this.current.y };
        this.to = { x: state.x, y: state.y };
        this.startedAt = now;
        this.callback?.();
    }

    /** Hard-set visual + targets (spawn / teleports). */
    snap(state: PositionState, now = clientTime.now()) {
        this.from = { x: state.x, y: state.y };
        this.to = { x: state.x, y: state.y };
        this.current = { x: state.x, y: state.y };
        this.startedAt = now;
        this.hasSegment = true;
        this.callback?.();
    }

    isComplete(now = clientTime.now()): boolean {
        if (!this.hasSegment) return true;
        return (
            now - this.startedAt >=
            this.interpolationMS * (1 + this.maxExtrapolate)
        );
    }
}

export type RotationState = number;

/** Same model as position: visual → latest over a fixed tick. */
export class RotationStates {
    private from: RotationState = 0;
    private to: RotationState = 0;
    private current: RotationState = 0;
    private hasSegment = false;
    private startedAt = clientTime.now();

    callback?: () => void;

    constructor(callback?: () => void) {
        this.callback = callback;
    }

    interpolate(now = clientTime.now()): number {
        if (!this.hasSegment) return this.current;

        const t = Math.min((now - this.startedAt) / SERVER_TICK_MS, 1);
        this.current = rotationLerp(this.from, this.to, t);
        return this.current;
    }

    isComplete(now = clientTime.now()): boolean {
        if (!this.hasSegment) return true;
        return now - this.startedAt >= SERVER_TICK_MS;
    }

    set(state: RotationState, now = clientTime.now()) {
        if (!this.hasSegment) {
            this.snap(state);
            return;
        }
        this.from = this.current;
        this.to = state;
        this.startedAt = now;
        this.callback?.();
    }

    /** Jump to a rotation with no interpolation (local look prediction). */
    snap(state: RotationState, now = clientTime.now()) {
        this.from = state;
        this.current = state;
        this.to = state;
        this.hasSegment = true;
        this.startedAt = now;
        this.callback?.();
    }
}
