import { Sky } from "./sky";

export function createSwitch(sky: Sky) {
    const switchCheckbox =
        document.querySelector<HTMLInputElement>("label.switch input")!;

    switchCheckbox.addEventListener("click", function () {
        if (switchCheckbox.checked) {
            sky.advanceCycle();
        } else {
            sky.advanceCycle();
        }
    });
}
