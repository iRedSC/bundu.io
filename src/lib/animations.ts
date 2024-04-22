export type Keyframes = { [key: string | number]: Keyframe };

export type Keyframe = (animation: ActiveAnimation) => void;

/**
 * Represents a stored animation.
 *
 * Use the `Animation.run()` method to retrieve an {@link ActiveAnimation}.
 */
export class Animation {
    keyframes: Keyframes;

    constructor() {
        this.keyframes = {};
    }

    /**
     * Retrieve a new {@link ActiveAnimation}.
     * @returns new {@link ActiveAnimation}
     */
    run() {
        return new ActiveAnimation(this.keyframes);
    }
}

/**
 * An active animation.
 *
 * @prop `id` animation id
 * @prop `keyframes` the {@link Keyframes} that make up the animation
 */
class ActiveAnimation {
    id?: number;
    keyframes: Keyframes;
    currentKeyframe: number;
    expired: boolean;
    start: number;
    duration: number;

    constructor(keyframes: Keyframes) {
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
    id?: number;
    expired: boolean;
    update(): void;
    end(): void;
};

type AnimationSource = {
    active?: boolean;
    renderable?: boolean;
    visible?: boolean;
    [key: string]: any;
};

function getSource(
    sources: Map<AnimationSource, ValidActiveAnimation[]>,
    source: AnimationSource
): ValidActiveAnimation[] {
    const value = sources.get(source);
    if (value === undefined) {
        sources.set(source, []);
    }
    return sources.get(source)!;
}

export class AnimationManager {
    sources: Map<AnimationSource, ValidActiveAnimation[]>;

    constructor() {
        this.sources = new Map();
    }

    /**
     * Add an animation to the manager without replacing existing ones.
     * This allows multiple animations with the same id.
     *
     * Use the `set()` method if you would like the manager to ignore the request in the
     * event of an existing animation with the same id.
     * @param source animation source
     * @param id the id of the animation, for removing and replacing
     * @param animation the ActiveAnimation
     */
    add(source: AnimationSource, id: number, animation: ValidActiveAnimation) {
        animation.id = id;
        getSource(this.sources, source).push(animation);
    }

    set(
        source: AnimationSource,
        id: number,
        animation: ValidActiveAnimation,
        replace: boolean = false
    ) {
        animation.id = id;

        const existingSource = getSource(this.sources, source);

        if (replace) {
            existingSource.forEach((animation) => {
                if (animation.id === id) {
                    animation.end();
                }
            });
            const filteredAnimations = existingSource.filter(
                (animation) => animation.id !== id
            );
            filteredAnimations.push(animation);
            this.sources.set(source, filteredAnimations);
            return;
        }
        if (!existingSource.find((animation) => animation.id === id)) {
            existingSource.push(animation);
        }
    }

    remove(source: AnimationSource, id?: number) {
        if (id === undefined) {
            this.sources.delete(source);
            return;
        }
        const foundSource = this.sources.get(source);
        if (!foundSource) {
            return;
        }
        this.sources.set(
            source,
            foundSource.filter((animation) => animation.id !== id)
        );
    }

    update() {
        for (let [source, animations] of this.sources.entries()) {
            if (
                source.active === false ||
                source.renderable === false ||
                source.visible === false
            ) {
                continue;
            }
            for (let [index, animation] of animations.entries()) {
                if (animation.expired) {
                    animation.end();
                    animations.splice(index, 1);
                } else {
                    animation.update();
                }
            }
        }
    }
}
