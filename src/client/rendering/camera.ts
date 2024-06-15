import {
    Container,
    FederatedPointerEvent,
    Graphics,
    Point,
    Rectangle,
    Ticker,
} from "pixi.js";
import { clamp, distance, lerp, moveToward } from "../../lib/transforms";
import { BasicPoint } from "../../lib/types";
import { z } from "zod";

export type CameraOptions = {
    worldWidth: number;
    worldHeight: number;

    screenWidth: number;
    screenHeight: number;

    ticker: Ticker;
    targets: BasicPoint[];
    speed: number;

    padding: number;

    zoom: number;
    maxZoom: number;
    minZoom: number;
    zoomSpeed: number;
    autoZoom: boolean;

    peek: number;
    deadZone: number;
};

type Nullish<T> = T | undefined | null;

function calculateBoundingBox(
    points: BasicPoint[],
    padding: number
): Rectangle {
    let minX = Number.MAX_VALUE;
    let minY = Number.MAX_VALUE;
    let maxX = Number.MIN_VALUE;
    let maxY = Number.MIN_VALUE;

    // Find minimum and maximum x and y coordinates
    points.forEach((point) => {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
    });

    // Add padding
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    // Return bounding box
    return new Rectangle(minX, minY, maxX - minX, maxY - minY);
}

const graphics = new Graphics();
graphics.zIndex = 1000;

function drawRect(rect: Rectangle, graphics: Graphics) {
    graphics.drawRect(rect.x, rect.y, rect.width, rect.height);
}

export class Camera {
    private _ticker?: Ticker;
    private _tickerCB?: (elapsed: number) => void;
    private pointerPos: Point;

    world: Container;

    width: number;
    height: number;

    worldWidth: number;
    worldHeight: number;

    padding: number;

    targets: BasicPoint[];
    readonly target: Point;
    center: Point;
    speed: number;

    private _zoom: number;
    maxZoom: Nullish<number>;
    minZoom: Nullish<number>;
    zoomSpeed: number;
    autoZoom: boolean;

    peek: number;
    deadZone: Nullish<number>;

    constructor(world: Container, options: Partial<CameraOptions> = {}) {
        this.world = world;
        this.world.addChild(graphics);
        world.sortChildren();

        this.worldWidth = options.worldWidth ?? this.world.width;
        this.worldHeight = options.worldHeight ?? this.world.height;

        this.width = options.screenWidth ?? window.innerWidth;
        this.height = options.screenHeight ?? window.innerHeight;

        this.padding = options.padding ?? 0.1;

        this.targets = options.targets ?? [];
        this.target = new Point();
        this.speed = options.speed ?? 1;

        this._zoom = options.zoom ?? 1;
        this.maxZoom = options.maxZoom;
        this.minZoom = options.minZoom;
        this.zoomSpeed = options.zoomSpeed ?? 1;
        this.autoZoom = options.autoZoom ?? false;

        this.peek = options.peek ?? 0;
        this.deadZone = options.deadZone;

        this.ticker = options.ticker;

        this.center = new Point();

        this.pointerPos = new Point();
        this.world.eventMode = "static";
        this.world.on("globalpointermove", this.updatePointerPos, this);
        this.world.on("wheel", (ev) => {
            this.addLinearZoom(ev.deltaY / 1000);
        });
    }

    addLinearZoom(amount: number) {
        this._zoom = this._zoom * Math.exp(amount);

        this._zoom = Math.max(this._zoom, this.minZoom ?? 0);
        if (this.maxZoom) this._zoom = Math.min(this._zoom, this.maxZoom);
    }

    set zoom(value: number) {
        this._zoom = value;
        this._zoom = Math.max(this._zoom, this.minZoom ?? 0.1);
        if (this.maxZoom) this._zoom = Math.min(this._zoom, this.maxZoom);
    }

    get zoom() {
        return this._zoom;
    }

    zoomToFit(width = this.worldWidth, height = this.worldHeight) {
        const scaleX = this.width / width;
        const scaleY = this.height / height;

        if (scaleX < scaleY) {
            this.zoom = scaleX;
            return;
        }
        this.zoom = scaleY;
    }

    updatePointerPos(ev: FederatedPointerEvent) {
        this.pointerPos.x = ev.clientX;
        this.pointerPos.y = ev.clientY;
    }

    set ticker(ticker: Ticker | undefined) {
        if (this._tickerCB && this._ticker) {
            this._ticker?.remove(this._tickerCB, this);
        }
        if (!ticker) return;
        this._tickerCB = () => this.update(ticker.elapsedMS);
        this._ticker = ticker;
        this._ticker?.add(this._tickerCB, this);
    }

    get ticker(): Ticker | undefined {
        return this._ticker;
    }

    /** Screen width in world coordinates */
    get widthInWorld(): number {
        return this.width / this.world.scale.x;
    }

    /** Screen height in world coordinates */
    get heightInWorld(): number {
        return this.height / this.world.scale.y;
    }

    /** World width in screen coordinates */
    get scaledWorldWidth(): number {
        return this.worldWidth * this.world.scale.x;
    }

    /** World height in screen coordinates */
    get scaledWorldHeight(): number {
        return this.worldHeight * this.world.scale.y;
    }

    fitBounds(bounds: Rectangle, zoom: boolean = false) {
        if (zoom) this.zoomToFit(bounds.width, bounds.height);
        this.target.x = bounds.x + bounds.width / 2;
        this.target.y = bounds.y + bounds.height / 2;
    }

    drawDebug(graphics: Graphics) {
        const visibleBounds = this.getVisibleBounds();
        graphics.clear();
        graphics.lineStyle({
            width: 5,
            color: 0xff0000,
        });
        drawRect(visibleBounds, graphics);

        const smallBounds = this.getVisibleBounds(this.padding);
        graphics.lineStyle({
            width: 5,
            color: 0x0000ff,
        });
        drawRect(smallBounds, graphics);

        const filteredTargets = this.targets.filter(
            (target, i) => i === 0 || smallBounds.contains(target.x, target.y)
        );

        for (const [i, target] of this.targets.entries()) {
            if (i === 0) {
                graphics.lineStyle({
                    width: 5,
                    color: 0x00ff00,
                });
                graphics.drawCircle(target.x, target.y, 2);
                continue;
            }
            graphics.lineStyle({
                width: 5,
                color: 0x0000ff,
            });
            graphics.drawCircle(target.x, target.y, 2);
        }

        const bounds = calculateBoundingBox(filteredTargets, this.padding);
        graphics.lineStyle({
            width: 5,
            color: 0x00ff00,
        });
        drawRect(bounds, graphics);
    }

    update(elapsed: number, snap?: boolean) {
        const smallBounds = this.getVisibleBounds(
            this.padding,
            this.minZoom ?? 0.01
        );

        // const filteredTargets = this.targets.filter(
        //     (target, i) => i === 0 || smallBounds.contains(target.x, target.y)
        // );

        const bounds = calculateBoundingBox(this.targets, this.padding);
        this.fitBounds(bounds, this.autoZoom);

        // this.drawDebug(graphics);

        let moveT = 1 - Math.exp(-(this.speed / 10) * elapsed);
        let zoomT = 1 - Math.exp(-(this.zoomSpeed / 10) * elapsed);
        if (snap) {
            moveT = 1;
            zoomT = 1;
        }

        // console.log(zoomT, this.center, this.target);
        this.world.scale.set(lerp(this.world.scale.x, this.zoom, zoomT));

        const x = lerp(this.center.x, this.target.x, moveT);
        const y = lerp(this.center.y, this.target.y, moveT);

        if (distance(this.target, this.center) > (this.deadZone ?? 0)) {
            const target = moveToward(
                this.target,
                this.center,
                this.deadZone ?? 0
            );
            this.target.copyFrom(target);
            this.center.x = x;
            this.center.y = y;
        }

        const peekingX =
            this.center.x +
            (this.pointerPos.x - window.innerWidth / 2) *
                (this.peek / this.zoom);
        const peekingY =
            this.center.y +
            (this.pointerPos.y - window.innerHeight / 2) *
                (this.peek / this.zoom);

        this.world.position.set(window.innerWidth / 2, window.innerHeight / 2);
        this.world.pivot.set(peekingX, peekingY);
    }

    getVisibleBounds(padding: number = 0, zoom: number = this.zoom) {
        if (
            (window.innerHeight / 2) * zoom <= padding ||
            (window.innerWidth / 2) * zoom <= padding
        ) {
            padding = 0;
        }
        return new Rectangle(
            this.center.x - window.innerWidth / 2 / zoom + padding,
            this.center.y - window.innerHeight / 2 / zoom + padding,
            window.innerWidth / zoom - padding * 2,
            window.innerHeight / zoom - padding * 2
        );
    }

    /**
     * Snap to the target.
     */
    snap() {
        this.update(0, true);
    }
}
