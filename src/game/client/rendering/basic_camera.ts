import {
    Container,
    FederatedPointerEvent,
    Graphics,
    Point,
    Rectangle,
    Ticker,
} from "pixi.js";
import {
    clamp,
    distance,
    lerp,
    moveToward,
    type BasicPoint,
} from "@ioengine/lib";

export type CameraOptions = {
    worldWidth: number;
    worldHeight: number;

    screenWidth: number;
    screenHeight: number;

    ticker: Ticker;
    target: BasicPoint;
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
    graphics.rect(rect.x, rect.y, rect.width, rect.height);
}

export class Camera {
    private _ticker?: Ticker;
    private _tickerCB?: (ticker: Ticker) => void;
    private pointerPos: Point;

    world: Container;

    width: number;
    height: number;

    worldWidth: number;
    worldHeight: number;

    padding: number;

    target: BasicPoint;
    center: Point;

    private _zoom: number;
    maxZoom: Nullish<number>;
    minZoom: Nullish<number>;
    zoomSpeed: number;

    peek: number;

    constructor(world: Container, options: Partial<CameraOptions> = {}) {
        this.world = world;
        this.world.addChild(graphics);
        world.sortChildren();

        this.worldWidth = options.worldWidth ?? this.world.width;
        this.worldHeight = options.worldHeight ?? this.world.height;

        this.width = options.screenWidth ?? window.innerWidth;
        this.height = options.screenHeight ?? window.innerHeight;

        this.padding = options.padding ?? 0.1;

        this.target = options.target ?? new Point();

        this._zoom = options.zoom ?? 1;
        this.maxZoom = options.maxZoom;
        this.minZoom = options.minZoom;
        this.zoomSpeed = options.zoomSpeed ?? 1;

        this.peek = options.peek ?? 0;

        this.center = new Point();

        this.pointerPos = new Point();
        this.world.eventMode = "static";
        this.world.on("globalpointermove", this.updatePointerPos, this);
        this.world.on("wheel", (ev) => {
            this.addLinearZoom(-ev.deltaY / 1000);
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

    updatePointerPos(ev: FederatedPointerEvent) {
        this.pointerPos.x = ev.clientX;
        this.pointerPos.y = ev.clientY;
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

    drawDebug(graphics: Graphics) {
        const visibleBounds = this.getVisibleBounds();
        graphics.clear();
        graphics.stroke({
            width: 5,
            color: 0xff0000,
        });
        drawRect(visibleBounds, graphics);

        const smallBounds = this.getVisibleBounds(this.padding);
        graphics.stroke({
            width: 5,
            color: 0x0000ff,
        });
        drawRect(smallBounds, graphics);

        graphics.stroke({
            width: 5,
            color: 0x00ff00,
        });
    }

    update() {
        this.center.x = this.target.x;
        this.center.y = this.target.y;

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
        this.update();
    }
}
