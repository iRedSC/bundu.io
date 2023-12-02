// export type Keyframes<T> = Map<number, Keyframe<T>>;

export class Keyframes<T> {
    map: Map<number, Keyframe<T>>;
    #nextKeyframe?: number;

    constructor() {
        this.map = new Map();
    }

    frame(frame: number) {
        this.#nextKeyframe = frame;
        return this;
    }

    set set(keyframe: Keyframe<T>) {
        if (this.#nextKeyframe === undefined) {
            throw "Must select a frame first.";
        }
        this.map.set(this.#nextKeyframe, keyframe);
        this.#nextKeyframe = undefined;
    }

    get(index: number) {
        return this.map.get(index);
    }
}

type Data = { [key: string]: unknown };

export type Keyframe<T> = ({
    target,
    animation,
}: {
    target: T;
    animation: Animation<T>;
}) => void;

export function lerp(a: number, b: number, t: number) {
    return a + (b - a) * t;
}

export class Animation<T> {
    target: T;
    keyframes: Keyframes<T>;
    replace: boolean;
    currentKeyframe: number;
    expired: boolean;
    start: number;
    duration: number;
    meta: { [key: string]: any };
    data?: Data;

    constructor(target: T, keyframes: Keyframes<T>, replace: boolean = false) {
        this.replace = replace;
        this.start = Date.now();
        this.duration = -1;
        this.expired = false;
        this.target = target;
        this.keyframes = keyframes;
        this.currentKeyframe = 0;
        this.meta = {};
    }

    update() {
        let frame = this.keyframes.get(this.currentKeyframe);
        if (frame && this.expired === false) {
            frame({ target: this.target, animation: this });
        }
    }

    next(duration: number) {
        if (this.keyframes.get(this.currentKeyframe + 1)) {
            this.start = Date.now();
            this.duration = duration;
            this.currentKeyframe++;
        }
    }

    previous(duration: number) {
        if (this.keyframes.get(this.currentKeyframe - 1)) {
            this.start = Date.now();
            this.duration = duration;
            this.currentKeyframe--;
        }
    }

    goto(frame: number, duration: number) {
        if (this.keyframes.get(frame)) {
            this.start = Date.now();
            this.duration = duration;
            this.currentKeyframe = frame;
        }
    }

    get keyframeEnded() {
        let ended = Date.now() > this.start + this.duration;
        return ended;
    }
    get firstKeyframe() {
        return this.duration === -1 ? true : false;
    }
    get t() {
        let msSinceStart = Date.now() - this.start;
        let t = msSinceStart / this.duration;
        return t > 1 ? 1 : t;
    }
}

export class AnimationManager<T> {
    target: T;
    animations: Map<string, Keyframes<T>>;
    activeAnimations: Map<string, Animation<T>>;

    constructor(target: T) {
        this.target = target;
        this.animations = new Map();
        this.activeAnimations = new Map();
    }

    add(name: string, keyframes: Keyframes<T>) {
        this.animations.set(name, keyframes);
    }

    start(name: string, replace?: boolean) {
        const keyframes = this.animations.get(name);
        if (!keyframes) {
            return;
        }
        const animation = new Animation(this.target, keyframes, replace);
        if (!animation.replace && this.activeAnimations.get(name)) {
            return;
        }
        this.activeAnimations.set(name, animation);
    }

    update() {
        for (let [name, animation] of this.activeAnimations.entries()) {
            if (animation.expired) {
                this.activeAnimations.delete(name);
            } else {
                animation.update();
            }
        }
    }
}
