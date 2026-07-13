import type { ServerPacket } from "@bundu/shared/packet_definitions";
import { Container, Graphics, Text } from "pixi.js";

const WIDTH = 250;
const ROW_HEIGHT = 26;

export class Leaderboard {
    readonly container = new Container();
    private readonly background = new Graphics();
    private readonly title = new Text({
        text: "Leaderboard · Tab",
        style: { fill: 0xffffff, fontFamily: "Arial", fontSize: 20 },
    });
    private readonly rows: Text[] = [];

    constructor() {
        this.title.position.set(16, 12);
        this.container.addChild(this.background, this.title);
        this.drawBackground(1);
    }

    toggle() {
        this.container.visible = !this.container.visible;
    }

    clear() {
        for (const row of this.rows) row.destroy();
        this.rows.length = 0;
        this.drawBackground(1);
    }

    update({ entries }: ServerPacket.Leaderboard) {
        while (this.rows.length > entries.length) {
            this.rows.pop()?.destroy();
        }
        for (const [index, entry] of entries.entries()) {
            let row = this.rows[index];
            if (!row) {
                row = new Text({
                    style: { fill: 0xffffff, fontFamily: "Arial", fontSize: 16 },
                });
                this.rows.push(row);
                this.container.addChild(row);
            }
            const name = entry.name.slice(0, 18);
            row.text = `${index + 1}. ${name} — ${entry.score.toLocaleString()}`;
            row.position.set(16, 44 + index * ROW_HEIGHT);
        }
        this.drawBackground(Math.max(entries.length, 1));
    }

    resize() {
        this.container.position.set(window.innerWidth - WIDTH - 16, 16);
    }

    private drawBackground(rowCount: number) {
        const height = 52 + rowCount * ROW_HEIGHT;
        this.background.clear().roundRect(0, 0, WIDTH, height, 8).fill({
            color: 0x10212d,
            alpha: 0.9,
        });
    }
}
