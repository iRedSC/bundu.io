import {
    SERVER_TICK_MS,
    lerp,
    rotationLerp,
} from "@bundu/shared";
import { serverTime } from "@client/globals";

export interface PositionState {
    x: number;
    y: number;
}

type Snapshot = PositionState & { time: number };

const MAX_SNAPSHOTS = 32;
/** Keep updating briefly after the newest snapshot so a late packet can extend the path. */
const HOLD_AFTER_MS = SERVER_TICK_MS;

/**
 * Snapshot-buffer interpolation for all entities (local and remote).
 * Renders at serverTime.now() (already delayed) between two stamped samples.
 */
export class PositionStates {
    private current: PositionState = { x: 0, y: 0 };
    private snapshots: Snapshot[] = [];

    callback?: () => void;

    constructor(callback?: () => void) {
        this.callback = callback;
    }

    interpolate(now = serverTime.now()): { x: number; y: number } {
        const snaps = this.snapshots;
        if (snaps.length === 0) return this.current;

        const first = snaps[0]!;
        if (snaps.length === 1) {
            this.current = { x: first.x, y: first.y };
            return this.current;
        }

        const latest = snaps[snaps.length - 1]!;

        if (now <= first.time) {
            this.current = { x: first.x, y: first.y };
            return this.current;
        }
        if (now >= latest.time) {
            this.current = { x: latest.x, y: latest.y };
            return this.current;
        }

        let i = 0;
        while (i < snaps.length - 1 && snaps[i + 1]!.time < now) i++;
        const a = snaps[i]!;
        const b = snaps[i + 1]!;
        const span = b.time - a.time;
        const t = span > 0 ? (now - a.time) / span : 1;

        this.current = {
            x: lerp(a.x, b.x, t),
            y: lerp(a.y, b.y, t),
        };
        return this.current;
    }

    /** @param time Server batch timestamp (same clock as serverTime sync). */
    set(state: PositionState, time = serverTime.now() + serverTime.renderDelay) {
        const snaps = this.snapshots;
        const last = snaps.length > 0 ? snaps[snaps.length - 1] : undefined;

        if (last && time < last.time) {
            // Out-of-order; ignore.
            return;
        }
        if (last && time === last.time) {
            snaps[snaps.length - 1] = { ...state, time };
        } else {
            snaps.push({ ...state, time });
        }
        while (snaps.length > MAX_SNAPSHOTS) snaps.shift();

        // Drop samples that are far behind the render point.
        const renderTime = serverTime.now();
        while (snaps.length > 2 && snaps[1]!.time < renderTime - SERVER_TICK_MS) {
            snaps.shift();
        }

        if (snaps.length === 1) {
            this.current = { x: state.x, y: state.y };
        }
        this.callback?.();
    }

    isComplete(): boolean {
        if (this.snapshots.length === 0) return true;
        const latest = this.snapshots[this.snapshots.length - 1]!;
        return serverTime.now() >= latest.time + HOLD_AFTER_MS;
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

    /** Jump to a rotation with no interpolation (local look prediction). */
    snap(state: RotationState) {
        this.last = state;
        this.current = state;
        this.next = state;
        this.lastUpdateTime = serverTime.now();
        this.callback?.();
    }
}
