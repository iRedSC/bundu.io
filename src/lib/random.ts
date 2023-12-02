function choose<T>(array: T[]): T {
    if (array.length === 0) {
        throw "Empty list"; // Return undefined if the array is empty
    }

    const randomIndex = Math.floor(Math.random() * array.length);
    return array[randomIndex];
}

function hexColor(): number {
    const letters = "0123456789ABCDEF";
    let color = 0x0;

    for (let i = 0; i < 6; i++) {
        color =
            (color << 4) |
            letters.indexOf(letters[Math.floor(Math.random() * 16)]);
    }

    return color;
}

export function integer(min: number, max: number): number {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

export const Random = {
    choose,
    hexColor,
    integer,
};
