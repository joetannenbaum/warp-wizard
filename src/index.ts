#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program
    .name('warp-wizard')
    .version('0.1.0')
    .description('A CLI for creating and launching Warp launch configs')
    .command('commands', 'Create, edit, or delete command groups')
    .command(
        'launch',
        "Launch a config associated with the directory or create a new one if it doesn't exist",
    );

program.parse(process.argv);
