type DisplayConfig = {
    x: number;
    y: number;
    rotation: number;
    scale: number;
};

export type ItemConfig = {
    [key: string]: {
        type?: string;
        sprite?: string;
        hand_display?: DisplayConfig;
        body_display?: DisplayConfig;
    };
};

export type ItemTypeConfig = {
    [key: string]: {
        hand_display?: DisplayConfig;
        body_display?: DisplayConfig;
    };
};
