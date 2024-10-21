export class MouseInputListener {
    mousePos: [number, number];

    onMouseMove: (pos: [number, number]) => void = () => {};

    constructor() {
        this.mousePos = [0, 0];

        document.body.addEventListener("mousemove", (event) => {
            this.mousePos[0] = event.clientX;
            this.mousePos[1] = event.clientY;
            this.onMouseMove(this.mousePos);
        });

        document.body.addEventListener("touchmove", (event) => {
            this.mousePos[0] = event.touches[0].clientX;
            this.mousePos[1] = event.touches[0].clientY;
            this.onMouseMove(this.mousePos);
        });
    }
}
