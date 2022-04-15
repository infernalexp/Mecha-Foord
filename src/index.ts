import chalk from "chalk";
import dotenv from "dotenv";
import { createWriteStream, ensureFile } from "fs-extra";
import { coloredLog, getLoggerLevelName, Logger, LoggerLevel } from "logerian";
import { cpus, totalmem } from "os";
import path from "path";
import { Bot } from "./Bot";
import { GayCommand } from "./commands/image/GayCommand";
import { GrayscaleCommand } from "./commands/image/GrayscaleCommand";
import { ToGifMessageCommand } from "./commands/image/ToGifMessageCommand";
import { ToGifSlashCommand } from "./commands/image/ToGifSlashCommand";
import { InfoCommand } from "./commands/InfoCommand";
import { formatBytes } from "./util/Util";

void (async function main() {
  dotenv.config({ path: path.join(__dirname, "../.env") });

  const logfile = path.join(__dirname, `../log/${new Date().toISOString()}.txt`);
  await ensureFile(logfile);

  const logger = new Logger({
    streams: [
      {
        level: process.env.ENVIRONMENT === "DEV" ? LoggerLevel.DEBUG : LoggerLevel.INFO,
        stream: process.stdout,
        prefix: coloredLog,
      },
      {
        level: LoggerLevel.DEBUG,
        stream: createWriteStream(logfile),
        prefix: (level: LoggerLevel) => `[${new Date().toISOString()}] [${getLoggerLevelName(level)}] `,
      },
    ],
  });

  if (typeof process.env.NODE_APP_INSTANCE !== "undefined") {
    logger.info(chalk`Instance\t{yellow ${process.env.NODE_APP_INSTANCE}}`);
  }
  logger.info(chalk`NodeJS\t{yellow ${process.version}}`);
  logger.info(chalk`OS\t{yellow ${process.platform} ${process.arch}}`);
  logger.info(chalk`CPUs\t{yellow ${cpus().length}}`);
  logger.info(chalk`Memory\t{yellow ${formatBytes(totalmem())}}`);

  const client = new Bot({
    // database: new Database(path.join(__dirname, "../database.json"), logger),
    intents: ["GUILDS", "GUILD_INTEGRATIONS", "GUILD_MESSAGES"],
    logger,
  });

  client.addCommand(
    new GayCommand(client),
    new GrayscaleCommand(client),
    new InfoCommand(client),
    new ToGifMessageCommand(client),
    new ToGifSlashCommand(client)
  );

  client.login(process.env.DISCORD_API_KEY);

  for (const signal of ["SIGABRT", "SIGHUP", "SIGINT", "SIGQUIT", "SIGTERM", "SIGUSR1", "SIGUSR2", "SIGBREAK"]) {
    process.on(signal, () => {
      if (signal === "SIGINT" && process.stdout.isTTY) {
        // We clear the line to get rid of nasty ^C characters.
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
      }
      logger.info(chalk`Recieved signal {yellow ${signal}}`);
      process.exit();
    });
  }

  process.on("uncaughtException", err => {
    logger.fatal(chalk`An uncaught exception occurred: {red ${err.message}}`);
    err.stack?.split("\n").forEach((line, index) => index && logger.fatal(line)); // Skips index == 0
    process.exit(1);
  });

  process.on("exit", code => {
    logger.info(chalk`Exiting with code {yellow ${code}}`);
    client.destroy();
  });
})();
