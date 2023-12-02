interface ItemConfig {
    [key: string]: {
        type?: string;
        sprite?: string;
        hand_display?: {
            x: number;
            y: number;
            rotation: number;
            scale: number;
        };
        body_display?: {
            x: number;
            y: number;
            rotation: number;
            scale: number;
        };
    };
}

interface ItemTypeConfig {
    [key: string]: {
        hand_display?: {
            x: number;
            y: number;
            rotation: number;
            scale: number;
        };
        body_display?: {
            x: number;
            y: number;
            rotation: number;
            scale: number;
        };
    };
}
