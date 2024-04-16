export type Keyframes = { [key: string | number]: Keyframe };

export type Keyframe = (animation: ActiveAnimation) => void;

export class Animation {
    id: number;
    keyframes: Keyframes;

    constructor(id: number) {
        this.id = id;
        this.keyframes = {};
    }

    run(replace: boolean = false) {
        return new ActiveAnimation(this.id, this.keyframes, replace);
    }
}

class ActiveAnimation {
    id: number;
    keyframes: Keyframes;
    replace: boolean;
    currentKeyframe: number;
    expired: boolean;
    start: number;
    duration: number;

    constructor(id: number, keyframes: Keyframes, replace: boolean = false) {
        this.id = id;
        this.replace = replace;
        this.start = Date.now();
        this.duration = -1;
        this.expired = false;
        this.keyframes = keyframes;
        this.currentKeyframe = 0;
    }

    update() {
        let frame = this.keyframes[this.currentKeyframe];
        if (frame && this.expired === false) {
            frame(this);
        }
    }

    next(duration: number) {
        if (this.keyframes[this.currentKeyframe + 1]) {
            this.start = Date.now();
            this.duration = duration;
            this.currentKeyframe++;
        }
    }

    previous(duration: number) {
        if (this.keyframes[this.currentKeyframe - 1]) {
            this.start = Date.now();
            this.duration = duration;
            this.currentKeyframe--;
        }
    }

    goto(frame: number, duration: number) {
        if (this.keyframes[frame]) {
            this.start = Date.now();
            this.duration = duration;
            this.currentKeyframe = frame;
        }
    }

    end() {
        if (this.keyframes[-1]) {
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
    get isFirstKeyframe() {
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

    remove(target: any) {
        this.sources.delete(target);
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
