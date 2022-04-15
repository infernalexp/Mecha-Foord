import { SlashCommandBuilder } from "@discordjs/builders";
import { Interaction } from "discord.js";
import { Bot } from "../Bot";
import { getChildLogger, LoggerInterface, Promised } from "../util/Util";

export abstract class Command {
  public client: Bot;
  protected logger: LoggerInterface;

  protected constructor(client: Bot) {
    this.client = client;
    this.logger = getChildLogger(client.getLogger(), this.constructor.name, 35, 90);
  }

  abstract exec(interaction: Interaction): Promised<void>;
  abstract getName(): string;
  public init(): Promised<void> {}
  abstract getCommandBuilder(): Promised<Pick<SlashCommandBuilder, "toJSON">>;
}
