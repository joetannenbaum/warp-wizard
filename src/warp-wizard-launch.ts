import * as p from '@clack/prompts';
import YAML from 'yaml';
import {
    directoryLaunchConfigPath,
    fetchCommandGroups,
    warpLaunchConfigsPath,
} from './common.js';
import {
    Command,
    CommandGroup,
    LaunchConfig,
    LaunchConfigTab,
} from './types.js';
import fs from 'fs';
import path from 'path';
import { runJxa } from 'run-jxa';
import { Command as Commander } from 'commander';
import child_process from 'child_process';
import * as dotenv from 'dotenv';

dotenv.config();

const program = new Commander();

const waitForWarpInSeconds = 15;

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

const selectCommandsFromGroup = async (
    group: CommandGroup,
): Promise<Command[]> => {
    await p.note(group.title, 'Auto-detected Command Group');

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

const runLaunchConfig = async (configName: string) => {
    const launchConfig = YAML.parse(fs.readFileSync(configName, 'utf8'));

    runJxa(`const se = Application('System Events');
        Application('Warp').activate();
        se.keystroke('l', { using: ['command down', 'control down'] });
        se.keystroke('${launchConfig.name}');
        se.keyCode(36);`);
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
                .concat([
                    {
                        value: {
                            title: 'None of the above',
                            commands: [],
                            detectFiles: [],
                        },
                        label: 'None of the above',
                    },
                ]),
        })) as CommandGroup;

        if (p.isCancel(group)) {
            onCancel();
        }

        if (group.title !== 'None of the above') {
            return selectCommandsFromGroup(group);
        }
    }

    return [];
};

const chunkArray = <T>(arr: T[], chunkSize: number): T[][] => {
    const res = [];

    for (let i = 0; i < arr.length; i += chunkSize) {
        const chunk = arr.slice(i, i + chunkSize);
        res.push(chunk);
    }

    return res;
};

const getCommandsAsTabs = (commands: Command[]): LaunchConfigTab[] => {
    return commands.map((command) => ({
        title: command.title,
        layout: {
            cwd: dir,
            commands: [{ exec: command.command }],
        },
    }));
};

const waitForWarpToRegisterLaunchConfig = async () => {
    const spinner = p.spinner();

    spinner.start('Waiting for Warp');

    await new Promise((resolve) =>
        setTimeout(resolve, 1000 * waitForWarpInSeconds),
    );

    spinner.stop('Done');
};

const replacePlaceholderInCommands = async (commands: Command[]) => {
    for (const command of commands) {
        const matches = command.command.match(/WARP_WIZARD_(\w+)/g);

        if (!matches) {
            continue;
        }

        for (const match of matches) {
            const key = match.replace('WARP_WIZARD_', '');

            const value = await p.text({
                message: `Enter value for ${key}:`,
                initialValue: process.env[key] || '',
                validate(value) {
                    if (value.trim().length === 0) {
                        return 'Value cannot be empty';
                    }
                },
            });

            if (p.isCancel(value)) {
                onCancel();
            }

            command.command = command.command.replace(match, value.toString());
        }
    }

    return commands;
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

    const rawCommands = await getCommands();

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

        rawCommands.push({
            title: commandTitle?.toString(),
            command: command.toString(),
            longRunning: !!longRunning,
        });
    }

    const commands = await replacePlaceholderInCommands(rawCommands);

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

    const tabs: LaunchConfigTab[] = [];

    const oneOff = commands.filter((command) => !command.longRunning);
    const longRunning = commands.filter((command) => command.longRunning);

    if (oneOff.length > 0) {
        // Non long running commands go in the first tab
        tabs.push({
            layout: {
                cwd: dir,
                commands: oneOff.map((command) => ({ exec: command.command })),
            },
        });
    }

    if (layout === 'tabs') {
        tabs.concat(getCommandsAsTabs(longRunning));
    } else {
        const numberOfPanesRaw = await p.text({
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

        if (p.isCancel(numberOfPanesRaw)) {
            onCancel();
        }

        const numberOfPanes = Number(numberOfPanesRaw);

        if (numberOfPanes === 1) {
            // Just split it into tabs
            tabs.concat(getCommandsAsTabs(longRunning));
        } else {
            chunkArray(longRunning, numberOfPanes).forEach((commands) => {
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
            });
        }
    }

    const finalYaml: LaunchConfig = {
        name: configName.toString(),
        windows: [{ tabs }],
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

    await p.note(configPath, 'Launch config created');

    await p.note(
        `It takes about ${waitForWarpInSeconds} seconds for Warp to register the new launch config.`,
        'Heads up',
    );

    const shouldWait = await p.confirm({
        message: 'Do you want me to wait with you?',
    });

    if (shouldWait) {
        await waitForWarpToRegisterLaunchConfig();
    }

    const shouldOpen = await p.confirm({
        message: 'Do you want to run your launch config now?',
    });

    if (shouldOpen) {
        await runLaunchConfig(configPath);
    }

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
    await p.intro("Ok, let's unlink this launch config");

    if (!associatedConfig) {
        await p.note(
            'No launch config associated with this directory!',
            'Nothing to unlink',
        );

        await p.outro('So... I guess we are done here.');

        return;
    }

    await p.note(associatedConfig, 'Config associated with this directory');

    const unlink = await p.confirm({
        message: 'Are you sure you want to unlink this launch config?',
    });

    if (p.isCancel(unlink) || !unlink) {
        onCancel();
    }

    unlinkDirectoryFromConfig();

    await p.outro('Launch config unlinked!');
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

    runLaunchConfig(associatedConfig);
};

launchConfig();
