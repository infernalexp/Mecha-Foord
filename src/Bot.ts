import { SlashCommandBuilder } from "@discordjs/builders";
import chalk from "chalk";
import { Client, ClientOptions as DiscordClientOptions, MessageEmbed } from "discord.js";
import { Command } from "./commands/Command";
import { getChildLogger, isHeartbeatLog, LoggerInterface, registerSlashCommands, setupRestClient } from "./util/Util";

export interface ClientOptions extends DiscordClientOptions {
  logger?: LoggerInterface;
}

export class Bot extends Client {
  private commands: Command[] = [];
  private loggedIn: boolean = false;
  private commandQueue: Command[] = [];
  private logger: LoggerInterface = this.setLogger();

  public constructor(options: ClientOptions) {
    super(options);

    this.setLogger(options.logger);

    this.on("debug", message => {
      if (!isHeartbeatLog(message)) {
        const matches = message.match(/^\[WS => (Shard \d+|Manager)\] /);
        let prefix: string;
        if (matches) {
          prefix = chalk`{gray [${matches[0].slice(7, -2)}]}`;
          message = message.slice(matches[0].length);
        } else {
          prefix = "";
          message = message;
        }

        for (const line of message.split("\n")) {
          this.logger.debug(`${prefix}${prefix ? " " : ""}${line}`);
        }
      }
    });

    this.on("ready", () => {
      this.logger.info(chalk`Logged in as {cyan ${(this as Client<true>).user.username}}`);
    });

    this.on("interactionCreate", interaction => {
      if (interaction.isCommand() || interaction.isMessageContextMenu()) {
        try {
          this.commands.find(command => command.getName() === interaction.commandName)?.exec(interaction);
        } catch (err) {
          this.logger.error(err);
          interaction.reply({
            ephemeral: true,
            embeds: [new MessageEmbed().setColor("RED").setTitle("An error occurred, please try again.")],
          });
        }
      }
    });
  }

  public override async login(token?: string): Promise<string> {
    this.loggedIn = true;
    await this.registerQueuedCommands();
    return await super.login(token);
  }

  public async addCommand(...commands: Command[]): Promise<void> {
    this.commandQueue.push(...commands);
    if (this.loggedIn) {
      this.registerQueuedCommands();
    }
  }

  private async registerQueuedCommands(): Promise<void> {
    const builders: Pick<SlashCommandBuilder, "toJSON">[] = [];

    const builderPromises: Promise<
      (Pick<SlashCommandBuilder, "toJSON"> & { command: Command }) | (Error & { command: Command; improper?: true })
    >[] = [];
    for (const command of this.commandQueue) {
      this.logger.debug(chalk`Building command {yellow ${command.getName()}}`);
      try {
        await command.init();
      } catch (err) {
        if (!(err instanceof Error)) {
          throw err;
        }
        this.logger.error(chalk`Couldn't initialize command {yellow ${command.getName()}}: {red ${err.message}}`);
        if (err.stack) {
          err.stack.split("\n").forEach((line, index) => index && this.logger.error(line)); // Skips index == 0
        }
        break;
      }
      const builderPromise = command.getCommandBuilder();
      if (builderPromise instanceof Promise) {
        builderPromises.push(
          builderPromise
            .then(builder => {
              this.logger.debug(chalk`Built command {yellow ${command.getName()}}`);
              (builder as unknown as { command: Command }).command = command;
              return builder;
            })
            .catch(err => {
              if (!(err instanceof Error)) {
                err = new Error(err);
                (err as { improper?: true }).improper = true;
              }
              (err as { command: Command }).command = command;
              return err;
            })
        );
      } else {
        this.logger.debug(chalk`Built command {yellow ${command.getName()}}`);
        (builderPromise as unknown as { command: Command }).command = command;
        builderPromises.push(
          Promise.resolve(builderPromise as Pick<SlashCommandBuilder, "toJSON"> & { command: Command })
        );
      }
    }

    const buildersOrErrors = await Promise.all(builderPromises);
    for (const builderOrError of buildersOrErrors) {
      if (builderOrError instanceof Error) {
        if (builderOrError.improper) {
          this.logger.error(chalk`Couldn't build command {yellow ${builderOrError.command.getName()}}`);
        } else {
          this.logger.error(
            chalk`Couldn't build command {yellow ${builderOrError.command.getName()}}: {red ${builderOrError.message}}`
          );
          if (builderOrError.stack) {
            builderOrError.stack.split("\n").forEach((line, index) => index && this.logger.error(line)); // Skips index == 0
          }
        }
      } else {
        builders.push(builderOrError);
        this.commands.push(builderOrError.command);
      }
    }

    this.logger.debug("Registering commands...");
    setupRestClient(this.token as string);
    await registerSlashCommands(
      {
        CLIENT_ID: process.env.CLIENT_ID as string,
        GUILD_ID: process.env.DEV_GUILD_ID,
      },
      ...builders
    );
    this.logger.debug(chalk`Added {yellow ${builders.length}} commands.`);
  }

  public setLogger(logger?: LoggerInterface): LoggerInterface {
    if (logger) {
      this.logger = getChildLogger(logger, "Discord", 34, 90);
    } else {
      this.logger = {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
        fatal: () => {},
      };
    }

    return this.logger;
  }

  public getLogger(): LoggerInterface {
    return this.logger;
  }
}
