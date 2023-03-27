import fs from 'fs';
import path from 'path';
import { CommandGroup } from './types';
import YAML from 'yaml';

export const groupPath = path.join(__dirname, '/group.yaml');

export const fetchCommandGroups = (): CommandGroup[] => {
    if (!fs.existsSync(groupPath)) {
        fs.writeFileSync(groupPath, '');

        return [];
    }

    const groups = fs.readFileSync(groupPath, 'utf-8');

    return YAML.parse(groups) || [];
};
