type GridElement = { position: { x: number; y: number } };

/**
 * Arrange elements in a grid.
 */
export class Grid {
    maxRows: number;

    spacingH: number;
    spacingV: number;

    elementWidth: number;
    elementHeight: number;

    constructor(
        spacingH: number,
        spacingV: number,
        width: number,
        height: number,
        maxRows: number
    ) {
        this.spacingH = spacingH;
        this.spacingV = spacingV;
        this.elementWidth = width;
        this.elementHeight = height;
        this.maxRows = maxRows;
    }

    arrange(elements: GridElement[]) {
        let currentCol = 0;
        let currentRow = 0;
        for (const element of elements) {
            element.position.x =
                currentCol * (this.spacingH + this.elementWidth);
            element.position.y =
                currentRow * (this.spacingV + this.elementHeight);

            currentRow++;

            if (currentRow >= this.maxRows) {
                currentRow = 0;
                currentCol++;
            }
        }
    }

    /** Row-major layout with a fixed column count (hotbar / backpack rows). */
    arrangeRows(elements: GridElement[], columns: number) {
        const cols = Math.max(1, columns);
        for (let i = 0; i < elements.length; i++) {
            const element = elements[i];
            if (!element) continue;
            const col = i % cols;
            const row = Math.floor(i / cols);
            element.position.x = col * (this.spacingH + this.elementWidth);
            element.position.y = row * (this.spacingV + this.elementHeight);
        }
    }
}
