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

export const tabColors = [
    { label: 'Red', value: 'red' },
    { label: 'Green', value: 'green' },
    { label: 'Yellow', value: 'yellow' },
    { label: 'Blue', value: 'blue' },
    { label: 'Magenta', value: 'magenta' },
    { label: 'Cyan', value: 'cyan' },
] as const;

export type LaunchConfigTabs = {
    tabs: LaunchConfigTab[];
};

export type LaunchConfigTab = {
    title?: string;
    layout: LaunchConfigTabLayout | LaunchConfigTabPane;
    color?: typeof tabColors[number]['value'];
};

export type LaunchConfigTabPane = {
    split_direction: 'horizontal' | 'vertical';
    panes: LaunchConfigTabPane[] | LaunchConfigTabLayout[];
};

export type LaunchConfigTabLayout = {
    cwd: string;
    commands: LaunchConfigCommand[];
};

export type LaunchConfigCommand = {
    exec: string;
};

export type LaunchConfig = {
    name: string;
    windows: LaunchConfigTabs[];
};
