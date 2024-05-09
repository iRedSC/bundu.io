import { World } from "./world/world";
import { PacketParser } from "../shared/unpack";
import { debugContainer } from "./rendering/debug";
import { Point } from "pixi.js";
import { createPixiApp } from "./rendering/app";
import { createViewport } from "./rendering/viewport";
import { AnimationManager } from "../lib/animations";
import { BunduClient } from "./client";
// import { ReflectionFilter } from "@pixi/filter-reflection";

// when the menu button is clicked, connect to the websocket and hide them menu.
document.querySelector("button")?.addEventListener("click", () => {
    const ws = new WebSocket("ws://localhost:7777");

    const animations = new AnimationManager();

    // create pixi.js app and add it to the document.
    const app = createPixiApp();
    app.view.classList.add("canvas");
    document.body.appendChild(app.view);

    // create pixi viewport and add it to app.
    const viewport = createViewport(app, new Point(0, 0));
    app.view.oncontextmenu = () => {
        return false;
    };
    app.stage.addChild(viewport);

    // add debug container to the viewport (shows hitboxes and ids)
    // viewport.addChild(debugContainer);
    debugContainer.zIndex = 1000;
    viewport.sortChildren();

    const world = new World(viewport, animations);
    const parser = new PacketParser();
    document
        .querySelectorAll(".menu")
        .forEach((item) => item.classList.add("hidden"));

    const resize = new Event("resize");

    setTimeout(() => window.dispatchEvent(resize), 50);

    const client = new BunduClient(
        app,
        ws,
        world,
        parser,
        animations,
        viewport
    );

    client.setupParser();

    ws.onclose = () => {
        document
            .querySelectorAll(".menu")
            .forEach((item) => item.classList.remove("hidden"));
    };
});
