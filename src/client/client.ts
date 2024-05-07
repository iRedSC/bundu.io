import { Viewport } from "pixi-viewport";
import { AnimationManager } from "../lib/animations";
import { PACKET, SCHEMA } from "../shared/enums";
import { PacketParser } from "../shared/unpack";
import { createParser } from "./network/packet_pipline";
import { drawPolygon } from "./rendering/debug";
import { World } from "./world/world";
import { decodeFromBlob } from "./network/decode";
import { z } from "zod";
import { validate } from "../shared/type_guard";
import { KeyboardInputListener } from "./input/keyboard";
import { MouseInputListener } from "./input/mouse";
import { degrees, lookToward, radians } from "../lib/transforms";
import { round } from "../lib/math";
import { encode } from "@msgpack/msgpack";
import { createUI } from "./ui/ui";
import { Application } from "pixi.js";
import { UIAnimationManager } from "./ui/animation_manager";

let updateTick = 0;
function mouseMoveCallback(
    socket: WebSocket,
    viewport: Viewport,
    world: World,
    mousePos: [number, number]
) {
    const player = world.objects.get(world.user || -1);
    if (player) {
        let mouseToWorld = viewport.toWorld(mousePos[0], mousePos[1]);
        const rotation =
            lookToward(player.position, mouseToWorld) - radians(90);
        updateTick++;
        if (Math.abs(player.rotation - rotation) > 0.1 || updateTick > 5) {
            updateTick = 0;
            socket.send(
                encode([PACKET.CLIENT.ROTATE, round(degrees(rotation))])
            );
        }
        player.rotation = rotation;
    }
}

// send movement packet to the server
// this is a callback function
function moveUpdate(socket: WebSocket, move: [number, number]) {
    const chat = document.querySelector<HTMLInputElement>("#chat-input")!;
    if (chat === document.activeElement) {
        return;
    }
    move[0] = Math.max(0, Math.min(2, move[0]));
    move[1] = Math.max(0, Math.min(2, move[1]));
    const dir = (move[0] << 2) | move[1];
    socket.send(encode([PACKET.CLIENT.MOVE_UPDATE, dir + 1]));
}

// callback for when a chat message is sent.
function chat(socket: WebSocket, message: string) {
    socket.send(encode([PACKET.CLIENT.CHAT_MESSAGE, message]));
}

const inventoryLeftClickCB = (socket: WebSocket, item: number) => {
    socket.send(encode([PACKET.CLIENT.SELECT_ITEM, item]));
};

const inventoryRightClickCB = (
    socket: WebSocket,
    item: number,
    shift: boolean = false
) => {
    socket.send(encode([PACKET.CLIENT.DROP_ITEM, [item, shift]]));
};

// list of ids that the server sent updates for but the client doesn't have
export let requestIds: Set<number> = new Set();

export class BunduClient {
    app: Application<HTMLCanvasElement>;
    socket: WebSocket;

    world: World;
    parser: PacketParser;
    animations: AnimationManager;
    viewport: Viewport;

    requestIdsInterval: NodeJS.Timeout;

    ui: any;

    constructor(
        app: Application<HTMLCanvasElement>,
        socket: WebSocket,
        world: World,
        parser: PacketParser,
        animations: AnimationManager,
        viewport: Viewport
    ) {
        this.app = app;
        this.socket = socket;
        this.world = world;
        this.parser = parser;
        this.animations = animations;
        this.viewport = viewport;

        this.socket.onmessage = async (ev) => {
            const data = await decodeFromBlob(ev.data);
            if (!validate(data, z.array(z.any()))) {
                return;
            }
            parser.unpackMany(data);
        };

        const keyboard = new KeyboardInputListener(
            moveUpdate.bind(moveUpdate, this.socket),
            chat.bind(chat, this.socket)
        );
        const mouse = new MouseInputListener(
            mouseMoveCallback.bind(
                mouseMoveCallback,
                this.socket,
                this.viewport,
                this.world
            )
        );

        // create ui and elements
        this.ui = createUI();

        this.ui.health.start(this.animations);
        this.ui.hunger.start(this.animations);
        this.ui.heat.start(this.animations);

        const craftItemCB = (item: number) => {
            this.socket.send(encode([PACKET.CLIENT.CRAFT_ITEM, item]));
        };

        this.ui.craftingMenu.setCallbacks(craftItemCB, craftItemCB);

        this.ui.inventory.setCallbacks(
            inventoryLeftClickCB.bind(undefined, this.socket),
            inventoryRightClickCB.bind(undefined, this.socket)
        );

        this.app.stage.addChild(this.ui.container);

        // send attack/block action when the user clicks on the viewport
        this.viewport.addEventListener("pointerdown", (event) => {
            if (event.button === 2) {
                this.send([PACKET.CLIENT.ACTION, [PACKET.ACTION.BLOCK, false]]);
            }
            if (event.button === 0) {
                this.send([
                    PACKET.CLIENT.ACTION,
                    [PACKET.ACTION.ATTACK, false],
                ]);
            }
            viewport;
        });

        this.viewport.addEventListener("pointerup", (event) => {
            if (event.button == 2) {
                this.send([PACKET.CLIENT.ACTION, [PACKET.ACTION.BLOCK, true]]);
            }
            if (event.button === 0) {
                this.send([PACKET.CLIENT.ACTION, [PACKET.ACTION.ATTACK, true]]);
            }
        });

        // request unknown object ids on interval
        this.requestIdsInterval = setInterval(() => {
            if (requestIds.size > 0) {
                this.send([
                    PACKET.CLIENT.REQUEST_OBJECTS,
                    Array.from(requestIds),
                ]);
                requestIds.clear();
            }
        }, 500);

        const nameInput = document.getElementById(
            "name-input"
        ) as HTMLInputElement;
        const name = nameInput.value;
        this.socket.onopen = () => {
            this.send([PACKET.CLIENT.JOIN, [name || "unnamed", 0, 0]]);
        };

        function tick() {
            world.tick();
            UIAnimationManager.update();
            requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    destroy() {
        clearInterval(this.requestIdsInterval);
    }

    send(message: any) {
        this.socket.send(encode(message));
    }

    setupParser() {
        createParser(this.parser, this.world);

        this.parser.set(
            PACKET.SERVER.PING,
            SCHEMA.SERVER.PING,
            (_: SCHEMA.SERVER.PING) => {}
        );

        this.parser.set(
            PACKET.SERVER.DRAW_POLYGON,
            SCHEMA.SERVER.DRAW_POLYGON,
            drawPolygon
        );

        this.parser.set(
            PACKET.SERVER.UPDATE_STATS,
            SCHEMA.SERVER.UPDATE_STATS,
            (packet: SCHEMA.SERVER.UPDATE_STATS) => {
                console.log(packet);
                this.ui.health.update(packet[0], this.animations);
                this.ui.hunger.update(packet[1], this.animations);
                this.ui.heat.update(packet[2], this.animations);
            }
        );

        this.parser.set(
            PACKET.SERVER.CRAFTING_RECIPES,
            SCHEMA.SERVER.CRAFTING_RECIPES,
            this.ui.recipeManager.updateRecipes.bind(this.ui.recipeManager)
        );

        this.parser.set(
            PACKET.SERVER.UPDATE_INVENTORY,
            SCHEMA.SERVER.UPDATE_INVENTORY,
            (packet: SCHEMA.SERVER.UPDATE_INVENTORY) => {
                this.ui.inventory.update(packet);
                this.ui.craftingMenu.items = this.ui.recipeManager.filter(
                    this.ui.inventory.items,
                    []
                );
                this.ui.craftingMenu.update();
            }
        );
    }
}
