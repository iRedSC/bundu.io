import { rotationLerp } from "../../lib/transforms";
import { serverTime } from "../globals";

export class RotationHandler {
    _interpolate: boolean;
    last: number;
    next: number;
    timestamp: number;
    duration: number;
    constructor(interpolate: boolean, duration: number) {
        this._interpolate = interpolate;
        this.last = 0;
        this.next = 0;
        this.timestamp = 0;
        this.duration = duration;
    }

    interpolate(now: number) {
        if (!this.interpolate) {
            return this.next;
        }
        const rotationT = (now - this.timestamp) / this.duration;
        return rotationLerp(this.last, this.next, rotationT);
    }

    set(current: number, next: number) {
        this.timestamp = serverTime.now() - 50;
        this.last = current;
        this.next = next;
    }
}
