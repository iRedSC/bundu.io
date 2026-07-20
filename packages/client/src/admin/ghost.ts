import { type Container, Graphics, Point } from "pixi.js";
import { AdminPlaceKind } from "@bundu/shared/packet_definitions";
import {
    FOOTPRINT_CIRCLE_RADIUS,
    TILE_SIZE,
    tileCenterWorld,
    worldToTile,
    type TileRot,
} from "@bundu/shared/tiles";
import { structureOriginAtPoint } from "@bundu/shared/structure_placement";
import { radians } from "@bundu/shared/transforms";
import { AnimationManagers } from "../animation/animations";
import {
    clientGroundType,
    clientStructurePlacement,
} from "../configs/registries";
import { groundModel } from "../world/ground";
import type { LayeredRenderer } from "../rendering/layered_renderer";
import type { EditorDeleteHover } from "../world/world";
import { createDecoration } from "../world/decoration";
import { Structure } from "../world/objects/structure";
import type { EditorTool, PaletteEntry } from "./state";

const ADMIN_GHOST_ID = -12;
const ADMIN_DELETE_OUTLINE_ID = -13;
const GHOST_ALPHA = 0.35;
const GHOST_TINT = 0xffffff;
/** Above sky multiply (200) / sky undo (201) so outlines stay crisp. */
const OVERLAY_Z = 250;
const DELETE_OUTLINE = 0xff4444;
const GROUND_GHOST_STROKE = 0xffffff;

export type AdminGhostCursor = {
    tool: EditorTool;
    selected: PaletteEntry | null;
    variant: string | null;
    rotation: TileRot;
    decorationRotation: number;
    decorationScale: number;
    worldX: number;
    worldY: number;
    /** Ground place drag rect in tiles (normalized). */
    groundRect?: { x: number; y: number; w: number; h: number };
    deleteHover?: EditorDeleteHover | null;
};

/**
 * Freecam editor placement preview + delete hover outline.
 */
export class AdminGhost {
    private structure?: Structure;
    private decoration?: Container;
    private ground?: Graphics;
    private groundSize = { w: 1, h: 1 };
    private deleteOutline?: Graphics;
    private identity = "";

    constructor(private readonly renderer: LayeredRenderer) {}

    update(cursor: AdminGhostCursor): void {
        if (cursor.tool === "look") {
            this.clear();
            return;
        }

        if (cursor.tool === "delete") {
            this.clearPlace();
            this.updateDeleteOutline(cursor.deleteHover ?? null);
            return;
        }

        this.clearDeleteOutline();
        if (!cursor.selected) {
            this.clearPlace();
            return;
        }

        const tx = worldToTile(cursor.worldX);
        const ty = worldToTile(cursor.worldY);
        const selected = cursor.selected;

        if (selected.kind === AdminPlaceKind.Ground) {
            this.clearStructure();
            this.clearDecoration();
            const rect = cursor.groundRect ?? { x: tx, y: ty, w: 1, h: 1 };
            const identity = `${selected.kind}:${selected.id}:${rect.w}x${rect.h}`;
            if (
                !this.ground ||
                this.identity !== identity ||
                this.groundSize.w !== rect.w ||
                this.groundSize.h !== rect.h
            ) {
                this.clearGround();
                this.ensureGround(selected.id, rect.w, rect.h);
                this.identity = identity;
                this.groundSize = { w: rect.w, h: rect.h };
            }
            if (this.ground) {
                this.ground.position.set(rect.x * TILE_SIZE, rect.y * TILE_SIZE);
            }
            return;
        }

        if (selected.kind === AdminPlaceKind.Decoration) {
            this.clearStructure();
            this.clearGround();
            const identity = `${selected.kind}:${selected.id}:${cursor.decorationScale}`;
            if (!this.decoration || this.identity !== identity) {
                this.clearDecoration();
                const sprite = createDecoration(
                    ADMIN_GHOST_ID,
                    selected.id,
                    cursor.worldX,
                    cursor.worldY,
                    cursor.decorationRotation,
                    cursor.decorationScale
                );
                sprite.container.alpha = GHOST_ALPHA;
                sprite.container.zIndex = OVERLAY_Z;
                this.decoration = sprite.container;
                this.renderer.add(ADMIN_GHOST_ID, sprite.container);
                this.identity = identity;
            }
            if (this.decoration) {
                this.decoration.position.set(cursor.worldX, cursor.worldY);
                this.decoration.rotation = radians(cursor.decorationRotation);
            }
            return;
        }

        this.clearGround();
        this.clearDecoration();
        const origin =
            selected.kind === AdminPlaceKind.Structure
                ? structureOriginAtPoint(
                      { x: tx, y: ty },
                      clientStructurePlacement(selected.id).blocked,
                      cursor.rotation
                  )
                : { x: tx, y: ty };
        const variant = cursor.variant ?? undefined;
        const identity = `${selected.kind}:${selected.id}:${selected.location}:${cursor.rotation}:${variant ?? ""}`;
        if (!this.structure || this.identity !== identity) {
            this.clearStructure();
            this.structure = new Structure(
                ADMIN_GHOST_ID,
                selected.location,
                new Point(
                    tileCenterWorld(origin.x),
                    tileCenterWorld(origin.y)
                ),
                cursor.rotation * 90,
                FOOTPRINT_CIRCLE_RADIUS,
                AnimationManagers.World,
                TILE_SIZE,
                variant
            );
            this.structure.setGhostAppearance(GHOST_ALPHA, GHOST_TINT);
            this.structure.container.eventMode = "none";
            this.renderer.add(ADMIN_GHOST_ID, ...this.structure.containers);
            this.identity = identity;
        }

        this.structure.position.set(
            tileCenterWorld(origin.x),
            tileCenterWorld(origin.y)
        );
        this.structure.rotation = radians(cursor.rotation * 90);
        this.structure.syncWorldLayers();
    }

    clear(): void {
        this.clearPlace();
        this.clearDeleteOutline();
        this.identity = "";
    }

    private clearPlace(): void {
        this.clearStructure();
        this.clearGround();
        this.clearDecoration();
        this.identity = "";
    }

    private updateDeleteOutline(hover: EditorDeleteHover | null): void {
        if (!hover) {
            this.clearDeleteOutline();
            return;
        }
        if (!this.deleteOutline) {
            const g = new Graphics();
            g.eventMode = "none";
            g.zIndex = OVERLAY_Z;
            this.deleteOutline = g;
            this.renderer.add(ADMIN_DELETE_OUTLINE_ID, g);
        }
        const g = this.deleteOutline;
        g.clear();
        if (hover.kind === "circle") {
            g.circle(hover.x, hover.y, hover.radius).stroke({
                width: 2,
                color: DELETE_OUTLINE,
                alpha: 1,
                pixelLine: true,
            });
            return;
        }
        g.rect(hover.x, hover.y, hover.w, hover.h).stroke({
            width: 2,
            color: DELETE_OUTLINE,
            alpha: 1,
            pixelLine: true,
        });
    }

    private ensureGround(typeId: number, tw: number, th: number): void {
        if (this.ground) return;
        const hex = groundModel(clientGroundType(typeId).model).color.replace(
            "#",
            ""
        );
        const color = Number.parseInt(hex, 16);
        const g = new Graphics();
        const pw = tw * TILE_SIZE;
        const ph = th * TILE_SIZE;
        g.rect(0, 0, pw, ph).fill({ color, alpha: GHOST_ALPHA });
        g.rect(0, 0, pw, ph).stroke({
            width: 2,
            color: GROUND_GHOST_STROKE,
            alpha: 0.9,
            pixelLine: true,
        });
        g.eventMode = "none";
        g.zIndex = OVERLAY_Z;
        this.ground = g;
        this.renderer.add(ADMIN_GHOST_ID, g);
    }

    private clearStructure(): void {
        if (!this.structure) return;
        this.structure.dispose();
        this.renderer.delete(ADMIN_GHOST_ID);
        this.structure = undefined;
    }

    private clearDecoration(): void {
        if (!this.decoration) return;
        this.renderer.delete(ADMIN_GHOST_ID);
        this.decoration = undefined;
    }

    private clearGround(): void {
        if (!this.ground) return;
        this.renderer.delete(ADMIN_GHOST_ID);
        this.ground = undefined;
        this.groundSize = { w: 1, h: 1 };
    }

    private clearDeleteOutline(): void {
        if (!this.deleteOutline) return;
        this.renderer.delete(ADMIN_DELETE_OUTLINE_ID);
        this.deleteOutline = undefined;
    }
}
