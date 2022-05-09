import {execa} from "execa";
import readline from "readline";
import chalk from "chalk";

export function runCommand(command, params) {
    const process = execa(command, params)

    const rl = readline.createInterface({input: process.stdout})
    const rle = readline.createInterface({input: process.stderr})

    rl.on(`line`, line => console.log(`${`[${chalk.bold(runCommand.prefix)}: ${command}]`} ${line}`))
    rle.on(`line`, line => console.log(`${chalk.red(`[${chalk.bold(runCommand.prefix)}: ${command}]`)} ${line}`))

    console.log(`${chalk.bold.green(">")} ${process.spawnargs.join(' ')}`)
    return process.catch(e => console.log(e.shortMessage))
}
