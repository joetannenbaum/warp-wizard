# Warp Wizard

Warp Wizard is a command line tool for interacting with the [Warp](https://warp.dev) terminal.

Currently, `warp-wizard` primarily handles the creation and running of [Warp launch configurations](https://docs.warp.dev/features/sessions/launch-configurations).

![Demo](docs/images/demo.gif)

## Installation

```bash
npm install -g warp-wizard
```

## Usage

`warp-wizard` associates launch configurations with the directory in which they are created.

To get started, head to the directory you want to associate with a launch configuration and run:

```bash
warp-wizard launch
```

This will walk you through creating a Warp launch configuration, step-by-step.

The next time you run `warp-wizard launch` in the same directory, it will automatically run the launch configuration you created.

### Options

`warp-wizard launch` supports the following options:

#### `--edit`, `-e`

```bash
warp-wizard launch --edit
```

This will offer to open the launch configuration associated with the directory in your default editor or reveal it in Finder.

#### `--unlink`, `-u`

```bash
warp-wizard launch --unlink
```

This will unlink the launch configuration associated with the directory.

#### `--link`, `-l`

```bash
warp-wizard launch --link
```

This will link a launch configuration you have already created with the current directory.

## Command Groups

To make it easier to quickly create launch configurations for common use cases, `warp-wizard` supports command groups. These are groups of commands you can create and re-use across multiple projects.

### Creating a Command Group

To create a command group, run:

```bash
warp-wizard commands
```

This will walk you through creating a command group, step-by-step. Notably, the wizard will ask you'd like to automatically select this command group when specific files are detected, relative to the directory in which you create the launch configuration.

For example, if you want to create a command group for a React Native project, you might tell `warp-wizard` to look for a `metro.config.js` file in the current directory. When you create a launch configuration in a directory that contains a `metro.config.js` file, `warp-wizard` will automatically select the "React Native" command group you created.

#### Placeholders

To use a placeholder in a command, prefix it with `WARP_WIZARD_`. The wizard will prompt you for a value when you use the command.

It will look for environment variables as a default value, so if you have a placeholder such as `WARP_WIZARD_APP_URL`, it will use the value of the environment variable `APP_URL` if it exists.

It will also read in an `.env` file if it exists in the current directory to account for those values.

#### `--edit`, `-e`

```bash
warp-wizard commands --edit
```

This will offer to open the your command groups config file in your default editor or reveal it in Finder.
