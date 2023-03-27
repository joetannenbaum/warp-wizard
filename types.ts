export type Command = {
    title?: string;
    command: string;
    longRunning: boolean;
};

export type CommandGroup = {
    title: string;
    detectFiles: string[];
    commands: Command[];
};
