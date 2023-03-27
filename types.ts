export type Command = {
    title?: string;
    command: string;
    longRunning: boolean;
};

export type CommandGroup = {
    // id: string;
    title: string;
    detectFiles: string[];
    commands: Command[];
};

// type SavedCommand = {
//     title: string;
//     command: string;
//     longRunning: boolean;
//     group: string;
// };
