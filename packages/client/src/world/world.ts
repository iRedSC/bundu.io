import { ServerPacket } from "@bundu/shared/packet_definitions";
import { Player } from "./objects/player";
import { Sky } from "./sky";
import { createGround } from "./ground";
import { radians } from "@bundu/shared";
import { AnimationManagers } from "../animation/animations";
import { TEXT_STYLE } from "../assets/text";
import { Point, Text } from "pixi.js";
import type { Viewport } from "pixi-viewport";
import { Camera } from "@client/rendering/camera";
import { LayeredRenderer } from "@client/rendering/layered_renderer";
import { serverTime } from "@client/globals";
import ObjectContainer from "./object_container";
import { CombatFx } from "./combat_fx";
import { GameObjectData } from "@bundu/shared/object_types";
import { Structure } from "./objects/structure";
import { getStringId } from "@bundu/shared/id_map";

type LoadPlayer = Extract<
    ServerPacket.LoadObject,
    { type: typeof GameObjectData.PlayerType }
>;
type LoadResource = Extract<
    ServerPacket.LoadObject,
    { type: typeof GameObjectData.ResourceNodeType }
>;

/** Client world scene — packet handlers land here after decode. */
export class World {
    viewport: Viewport;
    camera: Camera;
    user?: number;
    objects: ObjectContainer;
    combatFx: CombatFx;
    renderer: LayeredRenderer;
    sky: Sky;

    constructor(viewport: Viewport) {
        this.viewport = viewport;
        this.camera = new Camera(viewport);
        this.sky = new Sky();
        this.renderer = new LayeredRenderer(this.viewport);
        this.objects = new ObjectContainer();
        this.combatFx = new CombatFx(this.objects);

        this.viewport.addChild(this.sky);
        this.viewport.sortChildren();
    }

    clear() {
        this.camera.follow(null);

        const ids = Array.from(this.objects.all(), (object) => object.id);
        if (ids.length > 0) {
            this.deleteObjects({ objects: ids });
        }
        this.renderer.delete(-10);
        this.user = undefined;
    }

    tick() {
        AnimationManagers.World.update();
        this.objects.update(serverTime.now());
        this.camera.update();
    }

    private attachLocalPlayer(player: GameObject) {
        console.info(`Found user (id ${player.id}), loading..`);
        this.camera.follow(player.container);
    }

    clientConnectionInfo = (packet?: ServerPacket.ClientConnectionInfo) => {
        if (packet) {
            this.user = packet.playerId;
        }
        if (!this.user) return;

        const player = this.objects.get(this.user);
        if (!player) {
            console.warn(
                `No player with id ${this.user} found in world, waiting for load..`
            );
            return;
        }
        this.attachLocalPlayer(player);
    };

    loadObject = (packet: ServerPacket.LoadObject) => {
        switch (packet.type) {
            case GameObjectData.PlayerType:
                this.newPlayer(packet);
                break;
            case GameObjectData.ResourceNodeType:
                this.newStructure(packet);
                break;
        }
    };

    newPlayer = (packet: LoadPlayer) => {
        const [
            name,
            mainhand,
            offhand,
            helmet,
            backpack,
            _playerSkin,
            collisionRadius,
        ] = packet.data;
        const id = packet.id;
        this.renderer.delete(id);

        const pos = new Point(packet.x, packet.y);
        const nameText = new Text(name, TEXT_STYLE);

        const player = new Player(
            id,
            AnimationManagers.World,
            nameText,
            pos,
            packet.rotation,
            collisionRadius
        );

        player.setEquipment({ mainhand, offhand, helmet, backpack });
        this.objects.add(player);
        this.renderer.add(player.id, ...player.containers);

        if (id === this.user) {
            this.attachLocalPlayer(player);
        }
    };

    newStructure = (packet: LoadResource) => {
        const [collisionRadius, nodeType] = packet.data;
        this.renderer.delete(packet.id);

        const pos = new Point(packet.x, packet.y);
        const structure = new Structure(
            packet.id,
            getStringId(nodeType),
            pos,
            packet.rotation,
            collisionRadius
        );
        this.objects.add(structure);
        this.renderer.add(structure.id, ...structure.containers);
    };

    moveObject = (packet: ServerPacket.SetPosition, now: number) => {
        const object = this.objects.get(packet.id);
        if (!object) return;
        object.renderable = true;
        object.addPosition({ x: packet.x, y: packet.y });
        this.objects.updating.add(object);
        this.objects.add(object);
    };

    rotateObject = (packet: ServerPacket.SetRotation, _now: number) => {
        if (packet.id === this.user) return;
        const object = this.objects.get(packet.id);
        if (!object) return;
        object.addRotation(radians(packet.rotation));
        this.objects.updating.add(object);
    };

    deleteObjects = ({ objects }: ServerPacket.DeleteObjects) => {
        for (const id of objects) {
            const object = this.objects.get(id);
            this.objects.delete(id);
            object?.debug.destroy();
            AnimationManagers.World.remove(object);
            this.renderer.delete(id);
        }
    };

    updateEquipment = (packet: ServerPacket.UpdateEquipment) => {
        const player = this.objects.get(packet.id);
        if (player instanceof Player) {
            player.setEquipment(packet);
        }
    };

    selectStructure = (packet: ServerPacket.SetSelectedStructure) => {
        const player = this.objects.get(this.user || -1);
        if (player instanceof Player) {
            player.setSelectedStructure(
                packet.structureId,
                packet.structureSize
            );
        }
    };

    loadGround = (packet: ServerPacket.LoadGround) => {
        for (const data of packet.groundData) {
            const ground = createGround(...data);
            this.renderer.add(-10, ground);
        }
    };

    chatMessage = ({ id, message }: ServerPacket.ChatMessage) => {
        const player = this.objects.get(id);
        if (!(player instanceof Player)) return;
        console.log(player.name.text, message);
    };
}
