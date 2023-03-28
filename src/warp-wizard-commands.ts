import * as p from '@clack/prompts';
import YAML from 'yaml';
import fs from 'fs';
import { CommandGroup } from './types.js';
import { fetchCommandGroups, commandGroupConfigPath } from './common.js';
import { Command as Commander } from 'commander';
import child_process from 'child_process';

const program = new Commander();

program.option('-e, --edit', 'edit your existing command groups');

program.parse(process.argv);

const onCancel = () => {
    p.cancel('Ok, see you later.');
    process.exit(0);
};

const saveCommandGroup = (group: CommandGroup) => {
    const groups = fetchCommandGroups();

    groups.push(group);

    fs.writeFileSync(commandGroupConfigPath, YAML.stringify(groups));

    return groups;
};

const editCommandGroups = async () => {
    await p.intro("Ok! Let's edit your command groups.");

    await p.note(
        commandGroupConfigPath,
        'Config associated with this directory',
    );

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
        await child_process.exec(`open ${commandGroupConfigPath}`);
    }

    if (action === 'reveal') {
        await child_process.exec(`open -R ${commandGroupConfigPath}`);
    }

    await p.outro("It's editing time!");

    return;
};

const commandGroup = async () => {
    if (program.opts().edit) {
        return editCommandGroups();
    }

    const groups = fetchCommandGroups();

    await p.intro('Add a new command group');

    const groupName = await p.text({
        message: 'Group Name:',
        validate(value) {
            if (value.trim().length === 0) {
                return 'Group name cannot be empty';
            }

            if (groups.find((group) => group.title === value)) {
                return 'Group name already exists';
            }
        },
    });

    if (p.isCancel(groupName)) {
        onCancel();
    }

    const detectFiles: CommandGroup['detectFiles'] = [];

    while (true) {
        const file = await p.text({
            message:
                detectFiles.length === 0
                    ? 'Auto-select group when file is detected in directory:'
                    : 'Add another file to look for?',
            placeholder: 'e.g. metro.config.js (leave empty to continue)',
        });

        if (p.isCancel(file)) {
            onCancel();
        }

        if (typeof file === 'undefined') {
            break;
        }

        detectFiles.push(file.toString());
    }

    const commands: CommandGroup['commands'] = [];

    while (true) {
        const command = await p.text({
            message: 'Command to run:',
            placeholder: 'Leave empty to continue',
            validate(value) {
                if (commands.length === 0 && value.trim().length === 0) {
                    return 'You must add at least one command';
                }
            },
        });

        if (p.isCancel(command)) {
            onCancel();
        }

        if (typeof command === 'undefined') {
            break;
        }

        const longRunning = await p.confirm({
            message: 'Long running?',
        });

        if (p.isCancel(longRunning)) {
            onCancel();
        }

        const title = longRunning
            ? await p.text({
                  message: 'Command title:',
                  placeholder: 'Optional, shows as the title in the tab',
              })
            : undefined;

        if (p.isCancel(title)) {
            onCancel();
        }

        commands.push({
            command: command.toString(),
            title: title?.toString(),
            longRunning: !!longRunning,
        });
    }

    await p.outro(`${groupName.toString()} group created!`);

    saveCommandGroup({
        title: groupName.toString(),
        detectFiles,
        commands,
    });
};

commandGroup();
