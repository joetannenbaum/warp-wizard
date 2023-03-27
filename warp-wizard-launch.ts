import * as p from '@clack/prompts';
import YAML from 'yaml';
import { fetchCommandGroups } from './common';
import { Command, CommandGroup } from './types';
import fs from 'fs';
import path from 'path';

const onCancel = () => {
    p.cancel('Ok, see you later.');
    process.exit(0);
};

const tabColors = [
    { label: 'Red', value: 'red' },
    { label: 'Green', value: 'green' },
    { label: 'Yellow', value: 'yellow' },
    { label: 'Blue', value: 'blue' },
    { label: 'Magenta', value: 'magenta' },
    { label: 'Cyan', value: 'cyan' },
] as const;

const dir = process.cwd();

const selectCommandsFromGroup = async (
    group: CommandGroup,
): Promise<Command[]> => {
    const commands = (await p.multiselect({
        message: 'Commands to run:',
        options: group.commands.map((command) => ({
            value: command,
            label: command.title || command.command,
        })),
        required: false,
    })) as Command[];

    if (p.isCancel(commands)) {
        onCancel();
    }

    return commands;
};

const getCommands = async () => {
    const groups = fetchCommandGroups();

    const autoDetectedGroup = groups.find((group) =>
        group.detectFiles.find((fileToDetect) =>
            fs.existsSync(path.join(dir, fileToDetect)),
        ),
    );

    if (autoDetectedGroup) {
        return selectCommandsFromGroup(autoDetectedGroup);
    }

    if (groups.length > 0) {
        const group = (await p.select({
            message: 'Select a group:',
            options: groups
                .map((group) => ({
                    value: group,
                    label: group.title,
                }))
                .concat({
                    value: undefined,
                    label: 'None of the above',
                }),
        })) as CommandGroup | undefined;

        if (p.isCancel(group)) {
            onCancel();
        }

        if (group) {
            return selectCommandsFromGroup(group);
        }
    }

    return [];
};

const createNewLaunchConfig = async () => {
    const configDefaultName = dir.split('/').pop();

    await p.intro('Create a new launch configuration');

    const configName = await p.text({
        message: 'Launch config name?',
        initialValue: configDefaultName,
        validate(value) {
            if (value.trim().length === 0) {
                return 'Config name cannot be empty';
            }
        },
    });

    const commands = await getCommands();

    while (true) {
        const command = await p.text({
            message: 'Add custom command (leave blank to skip):',
        });

        if (typeof command === 'undefined') {
            break;
        }

        const commandTitle = await p.text({
            message: 'Custom command title:',
        });

        const longRunning = await p.confirm({
            message: 'Long running?',
        });

        commands.push({
            title: commandTitle.toString(),
            command: command.toString(),
            longRunning: !!longRunning,
        });
    }

    await p.outro('All done!');

    const tabs = [];

    const oneOff = commands.filter((command) => !command.longRunning);
    const longRunning = commands.filter((command) => command.longRunning);

    if (oneOff.length > 0) {
        tabs.push({
            layout: {
                cwd: dir,
                commands: oneOff.map((command) => ({ exec: command.command })),
            },
        });
    }

    longRunning.forEach((lr) => {
        tabs.push({
            title: lr.title,
            layout: {
                cwd: dir,
                commands: [{ exec: lr.command }],
            },
        });
    });

    console.log(YAML.stringify(tabs));
};

export const launchConfig = async () => {
    createNewLaunchConfig();
};

launchConfig();
