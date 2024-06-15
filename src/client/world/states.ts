import z from "zod";
import { round } from "../../lib/math";
import { lerp } from "../../lib/transforms";
import { validate } from "../../shared/type_guard";

const State = z.tuple([
    z.number(), // time
    z.number(), // x
    z.number(), // y
]);
type State = z.infer<typeof State>;

export class States {
    values: State[];
    callback?: () => void;

    constructor(callback?: () => void) {
        this.values = [];
        this.callback = callback;
    }

    interpolate(now: number) {
        // remove state if it is in the past
        const removeStaleStates = (tries = 0) => {
            const state = this.values[1];
            if (state && tries < 100) {
                if (Date.now() > state[0]) {
                    this.values = this.values.slice(1);
                    removeStaleStates(tries + 1);
                }
            }
        };
        removeStaleStates();

        const lastState = this.values[0];
        let nextState = this.values[1];

        if (!nextState) {
            if (lastState) {
                const x = lastState[1];
                const y = lastState[2];
                return [x, y];
            }
            return [0, 0];
        }
        const t = (now - lastState[0]) / (nextState[0] - lastState[0]);
        const tClamped = Math.max(0, Math.min(1, t));
        const x = round(lerp(lastState[1], nextState[1], tClamped));
        const y = round(lerp(lastState[2], nextState[2], tClamped));
        return [x, y];
    }

    set(state: State) {
        if (validate(state, State)) {
            this.values.push(state);
            // if there was no state updates for a while, this will set the old state's time
            // to the present so it can update smoothly.
            if (this.values.length === 2) {
                this.values[0][0] = Date.now();
            }
            if (this.callback) {
                this.callback();
            }
        }
    }
}
