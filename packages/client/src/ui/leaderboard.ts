import { UI_FONT } from "@client/assets/text";
import type { ServerPacket } from "@bundu/shared/packet_definitions";
import { Container, Graphics, Text } from "pixi.js";

const WIDTH = 280;
const ROW_HEIGHT = 30;
const PADDING = 14;

type LeaderboardRow = {
    name: Text;
    score: Text;
};

const titleStyle = {
    fill: 0xf6e5aa,
    fontFamily: UI_FONT,
    fontSize: 16,
    fontWeight: "bold",
    letterSpacing: 1,
} as const;

export class Leaderboard {
    readonly container = new Container();
    private readonly background = new Graphics();
    private readonly title = new Text({ text: "LEADERBOARD", style: titleStyle });
    private readonly scoreLabel = new Text({
        text: "SCORE",
        style: { ...titleStyle, fill: 0x9fb6bd, fontSize: 11 },
    });
    private readonly rows: LeaderboardRow[] = [];
    /** Raw player names from the last leaderboard packet (for command suggest). */
    private names: string[] = [];

    constructor() {
        this.title.position.set(PADDING, 12);
        this.scoreLabel.anchor.set(1, 0);
        this.scoreLabel.position.set(WIDTH - PADDING, 16);
        this.container.addChild(this.background, this.title, this.scoreLabel);
        this.drawBackground(1);
    }

    toggle() {
        this.container.visible = !this.container.visible;
    }

    /** Player names for selector autocomplete. */
    playerNames(): readonly string[] {
        return this.names;
    }

    clear() {
        for (const row of this.rows) {
            row.name.destroy();
            row.score.destroy();
        }
        this.rows.length = 0;
        this.names = [];
        this.drawBackground(1);
    }

    update({ entries }: ServerPacket.Leaderboard) {
        this.names = entries.map((entry) => entry.name);
        while (this.rows.length > entries.length) {
            const row = this.rows.pop();
            row?.name.destroy();
            row?.score.destroy();
        }

        for (const [index, entry] of entries.entries()) {
            let row = this.rows[index];
            if (!row) {
                row = {
                    name: new Text({
                        style: { fill: 0xeaf4f5, fontFamily: UI_FONT, fontSize: 15 },
                    }),
                    score: new Text({
                        style: { fill: 0xf6e5aa, fontFamily: UI_FONT, fontSize: 15, fontWeight: "bold" },
                    }),
                };
                row.score.anchor.set(1, 0);
                this.rows.push(row);
                this.container.addChild(row.name, row.score);
            }
            const y = 48 + index * ROW_HEIGHT;
            row.name.text = `${index + 1}. ${entry.name.slice(0, 18)}`;
            row.name.position.set(PADDING, y + 7);
            row.score.text = entry.score.toLocaleString();
            row.score.position.set(WIDTH - PADDING, y + 7);
        }
        this.drawBackground(Math.max(entries.length, 1));
    }

    resize() {
        this.container.position.set(window.innerWidth - WIDTH - 16, 16);
    }

    private drawBackground(rowCount: number) {
        const height = 48 + rowCount * ROW_HEIGHT + 8;
        this.background.clear();
        this.background
            .roundRect(0, 0, WIDTH, height, 10)
            .fill({ color: 0x10212d, alpha: 0.94 })
            .stroke({ color: 0x6d8c8f, alpha: 0.7, width: 1 });
        this.background.rect(PADDING, 39, WIDTH - PADDING * 2, 1).fill({
            color: 0x6d8c8f,
            alpha: 0.55,
        });
        for (let index = 0; index < rowCount; index++) {
            if (index % 2 === 0) {
                this.background
                    .roundRect(PADDING - 4, 48 + index * ROW_HEIGHT, WIDTH - PADDING * 2 + 8, ROW_HEIGHT - 2, 4)
                    .fill({ color: 0x27414a, alpha: 0.45 });
            }
        }
    }
}
