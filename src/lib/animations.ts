export type Keyframes = { [key: number]: Keyframe };

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
 * \@prop `id` — animation id\
 * \@prop `keyframes` — the {@link Keyframes} that make up the animation\
 * \@prop `currentKeyframe` — id of the keyframe that will be used in the `update()` method\
 * \@prop `expired` — whether or not the animation is expired. Will be removed from any {@link AnimationManager}s if true.\
 * \@prop `start` — the starting time of the current keyframe. Gets set to `Date.now()` when switch keyframes.\
 * \@prop `duration` — the duration of the current keyframe, in miliseconds.\
 * \@prop `keyframeEnded` — whether or not the current keyframe has ended (if `Date.now()` is greater than `start` + `duration`)\
 * \@prop `isFirstKeyframe` — whether or not thee current keyframe is the first one since the animation started\
 * \@prop `t` — the `t` value of the current keyframe, ranges from `0-1` as the normalized `duration`.
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

    /**
     * Call the current keyframe.
     */
    update() {
        let frame = this.keyframes[this.currentKeyframe];
        if (frame && this.expired === false) {
            frame(this);
        }
    }

    /**
     * Go to the next keyframe in the animation.
     * @param durationMS number of miliseconds to play the next frame for
     */
    next(durationMS: number) {
        if (this.keyframes[this.currentKeyframe + 1]) {
            this.start = Date.now();
            this.duration = durationMS;
            this.currentKeyframe++;
        }
    }

    /**
     * Go to the previous keyframe in the animation.
     * @param durationMS number of miliseconds to play the next frame for
     */
    previous(durationMS: number) {
        if (this.keyframes[this.currentKeyframe - 1]) {
            this.start = Date.now();
            this.duration = durationMS;
            this.currentKeyframe--;
        }
    }

    /**
     * Go to a specific keyframe in the animation
     * @param frame id of the frame to go to
     * @param durationMS number of miliseconds to play the frame for
     */
    goto(frame: number, durationMS: number) {
        if (this.keyframes[frame]) {
            this.start = Date.now();
            this.duration = durationMS;
            this.currentKeyframe = frame;
        }
    }

    /**
     * Plays frame `-1`.
     * Called automatically when `animation.expired` is set to `true`
     */
    end() {
        if (this.keyframes[-1]) {
            this.start = Date.now();
            this.duration = 0;
            this.currentKeyframe = -1;
            this.update();
        }
    }

    /**
     * The current keyframe has ended.
     */
    get keyframeEnded() {
        let ended = Date.now() > this.start + this.duration;
        return ended;
    }
    /**
     * The current keyframe is the very first in the animation.
     */
    get isFirstKeyframe() {
        return this.duration === -1 ? true : false;
    }

    /**
     * The `t` value of the current keyframe, ranges from `0-1` as the normalized `duration`.
     */
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

/**
 * A container for holding and running animations.
 *
 * Contains a `Map` with key of {@link AnimationSource} and value of {@link ActiveAnimation}
 */
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
     *
     * @param source animation source
     * @param id the id of the animation, for removing and replacing
     * @param animation the ActiveAnimation
     */
    add(
        source: AnimationSource,
        id: number,
        animation: ValidActiveAnimation
    ): void {
        animation.id = id;
        getSource(this.sources, source).push(animation);
    }

    /**
     * Will add target animation to the manager if one with the same id
     * does not exist, or if `replace` is `true`.
     *
     * @param source animation source
     * @param id the id of the animation, for removing and replacing
     * @param animation the ActiveAnimation
     * @param replace whether or not to replace any existing animations of the same id
     */
    set(
        source: AnimationSource,
        id: number,
        animation: ValidActiveAnimation,
        replace: boolean = false
    ): void {
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

    /**
     * Removes an animation source from the manager.
     * If an animation id is provided, removes only animations with matching id.
     *
     * @param source the animation source
     * @param id optional, the specific animation id to remove
     */
    remove(source: AnimationSource | undefined, id?: number): void {
        if (source === undefined) {
            return;
        }
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

    /**
     * Steps through each animation source, and runs `animation.update()`.
     *
     * If an animation is set to `expired`, removes it from the manager.
     *
     * If the source has any of `active`, `renderable`, or `visible` properties set to `false`,
     * skips updating animations from that source.
     */
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
