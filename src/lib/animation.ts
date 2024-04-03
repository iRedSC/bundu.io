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

export type Keyframe<T> = ({
    target,
    animation,
}: {
    target: T;
    animation: ActiveAnimation<T>;
}) => void;

export class AnimationMap<T> {
    target: T;
    animations: Map<number, Animation<T>>;

    constructor(target: T) {
        this.target = target;
        this.animations = new Map();
    }

    set(id: number, keyframes: Keyframes<T>) {
        const animation = new Animation(id, this.target, keyframes);
        this.animations.set(id, animation);
    }

    get(id: number) {
        return this.animations.get(id);
    }
}

export class Animation<T> {
    target: T;
    id: number;
    keyframes: Keyframes<T>;

    constructor(id: number, target: T, keyframes: Keyframes<T>) {
        this.id = id;
        this.target = target;
        this.keyframes = keyframes;
    }

    run(replace: boolean = false) {
        return new ActiveAnimation(
            this.id,
            this.target,
            this.keyframes,
            replace
        );
    }
}

class ActiveAnimation<T> {
    target: T;
    id: number;
    keyframes: Keyframes<T>;
    replace: boolean;
    currentKeyframe: number;
    expired: boolean;
    start: number;
    duration: number;
    meta: { [key: string]: any };

    constructor(
        id: number,
        target: T,
        keyframes: Keyframes<T>,
        replace: boolean = false
    ) {
        this.id = id;
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

    end() {
        if (this.keyframes.get(-1)) {
            this.start = Date.now();
            this.duration = 0;
            this.currentKeyframe = -1;
            this.update();
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

type ValidActiveAnimation = {
    expired: boolean;
    replace: boolean;
    id: number;
    update(): void;
    end(): void;
};

function getSource(
    sources: Map<any, any>,
    source: any
): Map<any, ValidActiveAnimation> {
    const value = sources.get(source);
    if (value === undefined) {
        sources.set(source, new Map());
    }
    return sources.get(source);
}

export class AnimationManager {
    sources: Map<any, Map<string, ValidActiveAnimation>>;

    constructor() {
        this.sources = new Map();
    }

    add(target: any, animation: ValidActiveAnimation) {
        const source = getSource(this.sources, target);
        const existing = source.get(animation.id);
        if (!animation.replace && existing) {
            return;
        }
        if (existing) {
            existing.end();
        }
        source.set(animation.id, animation);
    }

    update() {
        for (let animations of this.sources.values()) {
            for (let [name, animation] of animations.entries()) {
                if (animation.expired) {
                    animation.end();
                    animations.delete(name);
                } else {
                    animation.update();
                }
            }
        }
    }
}
