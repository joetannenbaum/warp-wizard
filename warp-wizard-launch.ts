import * as p from '@clack/prompts';
import YAML from 'yaml';
import {
    directoryLaunchConfigPath,
    fetchCommandGroups,
    warpLaunchConfigsPath,
} from './common';
import { Command, CommandGroup } from './types';
import fs from 'fs';
import path from 'path';
import { runJxa } from 'run-jxa';
import { Command as Commander } from 'commander';
import child_process from 'child_process';

const program = new Commander();

program
    .option(
        '-e, --edit',
        'edit the launch config associated with the directory',
    )
    .option(
        '-u, --unlink',
        'unlink the launch config associated with the directory',
    )
    .option(
        '-l, --link',
        'associate an existing launch config with this directory',
    );

program.parse(process.argv);

const onCancel = () => {
    p.cancel('Ok, see you later.');
    process.exit(0);
};

const fetchDirectoryLinks = () => {
    return (
        YAML.parse(fs.readFileSync(directoryLaunchConfigPath, 'utf-8')) || {}
    );
};

const dir = process.cwd();
const directoryLinks = fetchDirectoryLinks();
const associatedConfig = directoryLinks[dir];

const linkDirectoryToConfig = (configName: string) => {
    directoryLinks[dir] = configName;

    fs.writeFileSync(directoryLaunchConfigPath, YAML.stringify(directoryLinks));
};

const unlinkDirectoryFromConfig = () => {
    delete directoryLinks[dir];

    fs.writeFileSync(directoryLaunchConfigPath, YAML.stringify(directoryLinks));
};

const tabColors = [
    { label: 'Red', value: 'red' },
    { label: 'Green', value: 'green' },
    { label: 'Yellow', value: 'yellow' },
    { label: 'Blue', value: 'blue' },
    { label: 'Magenta', value: 'magenta' },
    { label: 'Cyan', value: 'cyan' },
] as const;

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

const chunkArray = (arr: any[], chunkSize: number) => {
    const res = [];

    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.slice(i, i + chunkSize);
        res.push(chunk);
    }

    return res;
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

    if (p.isCancel(configName)) {
        onCancel();
    }

    const commands = await getCommands();

    while (true) {
        const command = await p.text({
            message: 'Add custom command (leave blank to skip):',
        });

        if (p.isCancel(command)) {
            onCancel();
            break;
        }

        if (typeof command === 'undefined') {
            break;
        }

        const longRunning = await p.confirm({
            message: 'Long running?',
        });

        if (p.isCancel(longRunning)) {
            onCancel();
            break;
        }

        const commandTitle = longRunning
            ? await p.text({
                  message: 'Custom command title:',
                  placeholder: 'Optional, shows as the title in the tab',
              })
            : undefined;

        if (p.isCancel(commandTitle)) {
            onCancel();
            break;
        }

        commands.push({
            title: commandTitle?.toString(),
            command: command.toString(),
            longRunning: !!longRunning,
        });
    }

    const hasLongRunning = commands.find((command) => command.longRunning);

    const layout = hasLongRunning
        ? await p.select({
              message: 'Select a layout for your long running processes:',
              options: [
                  {
                      value: 'tabs',
                      label: 'One per tab',
                  },
                  {
                      value: 'panes',
                      label: 'Auto layout in panes',
                  },
              ],
          })
        : 'tabs';

    if (p.isCancel(layout)) {
        onCancel();
    }

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

    if (layout === 'tabs') {
        longRunning.forEach((longRunnCommand) => {
            tabs.push({
                title: longRunnCommand.title,
                layout: {
                    cwd: dir,
                    commands: [{ exec: longRunnCommand.command }],
                },
            });
        });
    } else {
        const numberOfPanes = await p.text({
            message: 'Max number of panes per tab?',
            initialValue: '4',
            validate(value) {
                if (isNaN(Number(value))) {
                    return 'Must be a number';
                }

                if (Number(value) < 1) {
                    return 'Must be at least 1';
                }
            },
        });

        if (p.isCancel(numberOfPanes)) {
            onCancel();
        }

        const numberOfPanesInt = Number(numberOfPanes);

        if (numberOfPanesInt === 1) {
            // Just split it into tabs
            longRunning.forEach((longRunningCommand) => {
                tabs.push({
                    title: longRunningCommand.title,
                    layout: {
                        cwd: dir,
                        commands: [{ exec: longRunningCommand.command }],
                    },
                });
            });
        } else {
            chunkArray(longRunning, Number(numberOfPanes)).forEach(
                (commands) => {
                    tabs.push({
                        layout: {
                            split_direction: 'horizontal',
                            panes: chunkArray(commands, 2).map((commands) => ({
                                split_direction: 'vertical',
                                panes: commands.map((command) => ({
                                    cwd: dir,
                                    commands: [{ exec: command.command }],
                                })),
                            })),
                        },
                    });
                },
            );
        }
    }

    const finalYaml = {
        name: configName,
        windows: [
            {
                tabs,
            },
        ],
    };

    const filename = configName
        .toString()
        .replace(/[^a-z0-9]/gi, '-')
        .toLowerCase();

    let configPath = path.join(warpLaunchConfigsPath, `${filename}.yaml`);

    let i = 1;

    while (fs.existsSync(configPath)) {
        configPath = path.join(warpLaunchConfigsPath, `${filename}-${i}.yaml`);
        i++;
    }

    fs.writeFileSync(configPath, YAML.stringify(finalYaml));

    linkDirectoryToConfig(configPath);

    await p.outro('All done!');
};

const editLaunchConfig = async () => {
    await p.intro("Ok! Let's edit your launch config.");

    if (associatedConfig) {
        await p.note(associatedConfig, 'Config associated with this directory');

        const action = await p.select({
            message: 'What would you like to do?',
            options: [
                {
                    value: 'open',
                    label: 'Open it in the default editor',
                },
                {
                    value: 'reveal',
                    label: 'Reveal it in Finder',
                },
            ],
        });

        if (p.isCancel(action)) {
            onCancel();
        }

        if (action === 'open') {
            await child_process.exec(`open ${associatedConfig}`);
        }

        if (action === 'reveal') {
            await child_process.exec(`open -R ${associatedConfig}`);
        }

        await p.outro("It's editing time!");

        return;
    }

    await p.note('No launch config found for this directory', 'Hm.');

    const createNew = await p.confirm({
        message: 'Would you like to create a new one?',
    });

    if (!createNew || p.isCancel(createNew)) {
        onCancel();
    }

    if (createNew) {
        return createNewLaunchConfig();
    }
};

const unlinkLaunchConfig = async () => {
    if (!associatedConfig) {
        await p.note(
            'No launch config associated with this directory!',
            'Nothing to unlink',
        );
        return;
    }

    await p.intro("Ok, let's unlink this launch config");

    await p.note(associatedConfig, 'Config associated with this directory');

    const unlink = await p.confirm({
        message: 'Are you sure you want to unlink this launch config?',
    });

    if (p.isCancel(unlink)) {
        onCancel();
    }

    if (unlink) {
        unlinkDirectoryFromConfig();

        await p.outro('Launch config unlinked!');
    }
};

const linkLaunchConfig = async () => {
    await p.intro("Ok, let's associate a launch config with this directory");

    if (associatedConfig) {
        await p.note(
            associatedConfig,
            'Currently associated with this directory',
        );

        const unlink = await p.confirm({
            message: 'Do you want to unlink it and link a new one?',
        });

        if (p.isCancel(unlink) || !unlink) {
            onCancel();

            return;
        }
    }

    const files = fs.readdirSync(warpLaunchConfigsPath);

    const launchConfigs = files
        .filter((file) => file.endsWith('.yaml'))
        .map((file) => ({
            value: file,
            label: file,
        }));

    if (launchConfigs.length === 0) {
        await p.note('No launch configs found!', 'Nothing to link');

        const createNew = await p.confirm({
            message: 'Create a new launch config?',
        });

        if (p.isCancel(createNew)) {
            onCancel();
        }

        if (createNew) {
            return createNewLaunchConfig();
        }

        return;
    }

    const selectedLaunchConfig = (await p.select({
        message: 'Select a launch config to link',
        options: launchConfigs,
    })) as string;

    if (p.isCancel(selectedLaunchConfig)) {
        onCancel();
    }

    linkDirectoryToConfig(
        path.join(warpLaunchConfigsPath, selectedLaunchConfig),
    );

    await p.outro('Launch config linked!');
};

export const launchConfig = async () => {
    if (program.opts().edit) {
        return editLaunchConfig();
    }

    if (program.opts().unlink) {
        return unlinkLaunchConfig();
    }

    if (program.opts().link) {
        return linkLaunchConfig();
    }

    if (!associatedConfig) {
        return createNewLaunchConfig();
    }

    const launchConfig = YAML.parse(fs.readFileSync(associatedConfig, 'utf8'));

    runJxa(`const se = Application('System Events');
        Application('Warp').activate();
        se.keystroke('l', { using: ['command down', 'control down'] });
        se.keystroke('${launchConfig.name}');
        se.keyCode(36);`);
};

launchConfig();
