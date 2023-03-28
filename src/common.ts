import fs from 'fs';
import path from 'path';
import { CommandGroup } from './types';
import YAML from 'yaml';
import os from 'os';

export const configDirectory = path.join(os.homedir(), '.warp-wizard');
export const commandGroupConfigPath = path.join(
    configDirectory,
    'command-groups.yaml',
);
export const directoryLaunchConfigPath = path.join(
    configDirectory,
    'directory-launch-configs.yaml',
);
export const warpLaunchConfigsPath = path.join(
    os.homedir(),
    '.warp',
    'launch_configurations',
);

if (!fs.existsSync(configDirectory)) {
    fs.mkdirSync(configDirectory);
}

[commandGroupConfigPath, directoryLaunchConfigPath].forEach((p) => {
    if (!fs.existsSync(p)) {
        fs.writeFileSync(p, '');
    }
});

export const fetchCommandGroups = (): CommandGroup[] => {
    const groups = fs.readFileSync(commandGroupConfigPath, 'utf-8');

    return YAML.parse(groups) || [];
};
