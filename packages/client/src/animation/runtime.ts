export type Keyframes = { [key: number]: Keyframe };

export type Keyframe = (animation: ActiveAnimation) => void;

/**
 * Represents a stored animation.
 *
 * Use the `Animation.run()` method to retrieve an {@link ActiveAnimation}.
 */
export class Animation {
    keyframes: Keyframes = {};
    cleanup?: Keyframe;

    /**
     * Retrieve a new {@link ActiveAnimation}.
     * @returns new {@link ActiveAnimation}
     */
    run() {
        return new ActiveAnimation(this.keyframes, this.cleanup);
    }
}

/**
 * An active animation.
 *
 * \@prop `id` — animation id\
 * \@prop `keyframes` — the {@link Keyframes} that make up the animation\
 * \@prop `currentKeyframe` — id of the keyframe that will be used in the `update()` method\
 * \@prop `expired` — whether or not the animation is expired. Will be removed from any {@link AnimationManager}s if true.\
 * \@prop `start` — the monotonic start time of the current keyframe.\
 * \@prop `duration` — the duration of the current keyframe, in miliseconds.\
 * \@prop `keyframeEnded` — whether the current keyframe has ended.\
 * \@prop `isFirstKeyframe` — whether or not thee current keyframe is the first one since the animation started\
 * \@prop `t` — the `t` value of the current keyframe, ranges from `0-1` as the normalized `duration`.
 */
class ActiveAnimation {
    id?: string;
    keyframes: Keyframes;
    currentKeyframe: number;
    expired: boolean;
    start: number;
    duration: number;
    firstFrameTrigger: boolean;
    cleanup?: Keyframe;
    private time: number;

    constructor(keyframes: Keyframes, cleanup?: Keyframe) {
        this.time = clientTime.now();
        this.start = this.time;
        // -1 marks "not yet timed"; callers use isFirstKeyframe + goto/next to set duration
        this.duration = -1;
        this.expired = false;
        this.keyframes = keyframes;
        this.currentKeyframe = 0;
        this.firstFrameTrigger = true;
        this.cleanup = cleanup;
    }

    /**
     * Call the current keyframe.
     */
    update(now = clientTime.now()) {
        this.time = now;
        const frame = this.keyframes[this.currentKeyframe];
        if (frame && this.expired === false) {
            frame(this);
            this.firstFrameTrigger = false;
        }
    }

    /**
     * Go to the next keyframe in the animation.
     * @param durationMS number of miliseconds to play the next frame for
     */
    next(durationMS: number) {
        if (this.keyframes[this.currentKeyframe + 1]) {
            this.start = this.time;
            this.duration = durationMS;
            this.currentKeyframe++;
            this.firstFrameTrigger = true;
        }
    }

    /**
     * Go to the previous keyframe in the animation.
     * @param durationMS number of miliseconds to play the next frame for
     */
    previous(durationMS: number) {
        if (this.keyframes[this.currentKeyframe - 1]) {
            this.start = this.time;
            this.duration = durationMS;
            this.currentKeyframe--;
            this.firstFrameTrigger = true;
        }
    }

    /**
     * Go to a specific keyframe in the animation
     * @param frame id of the frame to go to
     * @param durationMS number of miliseconds to play the frame for
     */
    goto(frame: number, durationMS: number) {
        if (this.keyframes[frame]) {
            this.start = this.time;
            this.duration = durationMS;
            this.currentKeyframe = frame;
            this.firstFrameTrigger = true;
        }
    }

    /**
     * Plays frame `-1`.
     * Called automatically when `animation.expired` is set to `true`
     */
    end() {
        if (!this.cleanup) return;
        this.start = this.time;
        this.duration = 0;
        this.currentKeyframe = -1;
        this.firstFrameTrigger = true;
        this.cleanup(this);
    }

    /**
     * The current keyframe has ended.
     */
    get keyframeEnded() {
        return this.time > this.start + this.duration;
    }
    /**
     * The current keyframe is the very first in the animation.
     */
    get isFirstKeyframe() {
        return this.duration === -1;
    }

    /**
     * The `t` value of the current keyframe, ranges from `0-1` as the normalized `duration`.
     */
    get t() {
        const msSinceStart = this.time - this.start;
        const t = msSinceStart / this.duration;
        return t > 1 ? 1 : t;
    }

    get now() {
        return this.time;
    }
}

type ValidActiveAnimation = {
    id?: string;
    expired: boolean;
    update(now?: number): void;
    end(): void;
};

type AnimationSource = {
    active?: boolean;
    renderable?: boolean;
    visible?: boolean;
};

function getSource(
    sources: Map<AnimationSource, ValidActiveAnimation[]>,
    source: AnimationSource
): ValidActiveAnimation[] {
    const existing = sources.get(source);
    if (existing) return existing;
    const animations: ValidActiveAnimation[] = [];
    sources.set(source, animations);
    return animations;
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

    clear() {
        for (const animations of this.sources.values()) {
            for (const animation of animations) animation.end();
        }
        this.sources.clear();
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
        id: string,
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
        id: string,
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
    remove(source: AnimationSource | undefined, id?: string): void {
        if (source === undefined) {
            return;
        }
        if (id === undefined) {
            for (const animation of this.sources.get(source) ?? []) {
                animation.end();
            }
            this.sources.delete(source);
            return;
        }
        const foundSource = this.sources.get(source);
        if (!foundSource) {
            return;
        }
        for (const animation of foundSource) {
            if (animation.id === id) animation.end();
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
    update(now = clientTime.now()) {
        for (const [source, animations] of this.sources.entries()) {
            if (
                source.active === false ||
                source.renderable === false ||
                source.visible === false
            ) {
                continue;
            }
            const remaining: ValidActiveAnimation[] = [];
            for (const animation of animations) {
                if (animation.expired) {
                    animation.end();
                } else {
                    animation.update(now);
                    remaining.push(animation);
                }
            }
            this.sources.set(source, remaining);
        }
    }
}
import { clientTime } from "@client/globals";
