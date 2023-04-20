import {execa} from "execa";
import readline from "readline";
import chalk from "chalk";

export function runCommand(command, params) {
    return new Promise((resolve, reject) => {
        const process = execa(command, params);

        const rl = readline.createInterface({input: process.stdout});
        const rle = readline.createInterface({input: process.stderr});

        rl.on("line", line => console.log(`${`[${chalk.bold(runCommand.prefix)}: ${command}]`} ${line}`));
        rle.on("line", line => console.log(`${chalk.red(`[${chalk.bold(runCommand.prefix)}: ${command}]`)} ${line}`));

        console.log(`${chalk.bold.green(">")} ${process.spawnargs.join(' ')}`);

        process
            .then(resolve)
            .catch((error) => {
                console.log(error.shortMessage);
                reject(error);
            });
    });
}
