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
}
