import { SlashCommandBooleanOption, SlashCommandBuilder } from "@discordjs/builders";
import { CommandInteraction, MessageEmbed } from "discord.js";
import os from "os";
import { Bot } from "../Bot";
import { formatBytes, getPackageJSON, objectEntries, secondsToDDHHMMSS } from "../util/Util";
import { Command } from "./Command";

export class InfoCommand extends Command {
  private packageJSON?: {
    name: string;
    version: string;
    description: string;
    bugs: string;
    dependencies: { [key: string]: string };
    devDependencies: { [key: string]: string };
  };

  public constructor(client: Bot) {
    super(client);
  }

  private getDefaultEmbed(): MessageEmbed {
    if (!this.packageJSON) {
      throw new Error("Package JSON not found!");
    }
    let embed = new MessageEmbed()
      .setColor("BLUE")
      .setDescription(this.packageJSON.description)
      .addFields([
        {
          name: "Host System",
          value: `${process.platform} ${process.arch}`,
          inline: true,
        },
        {
          name: "Processor Cores",
          value: os.cpus().length.toString(),
          inline: true,
        },
        {
          name: "Memory",
          value: `Process usage: ${formatBytes(process.memoryUsage.rss())}\nSystem usage: ${formatBytes(
            os.totalmem() - os.freemem()
          )}\nTotal: ${formatBytes(os.totalmem())}`,
          inline: true,
        },
        {
          name: "Uptime",
          value: secondsToDDHHMMSS(process.uptime()),
          inline: true,
        },
        {
          name: "Version",
          value: this.packageJSON.version,
          inline: true,
        },
        {
          name: "Issue Tracker",
          value: `[Click Here](${this.packageJSON.bugs})`,
          inline: true,
        },
        {
          name: "Dependencies",
          value:
            `${objectEntries(this.packageJSON.dependencies).length} dependencies\n` +
            `${objectEntries(this.packageJSON.devDependencies).length} development dependencies`,
          inline: true,
        },
      ]);

    return embed;
  }

  private getDependencyEmbed(): MessageEmbed {
    if (!this.packageJSON) {
      throw new Error("Package JSON not found!");
    }
    return new MessageEmbed().setColor("BLUE").setDescription(
      objectEntries(this.packageJSON.dependencies)
        .map(([dependency]) => `[${dependency}](https://npmjs.com/package/${dependency})`)
        .join("\n")
    );
  }

  public override getName(): string {
    return "info";
  }

  public override async exec(interaction: CommandInteraction): Promise<void> {
    interaction.reply({
      embeds: [
        interaction.options.getBoolean("dependencies", false) ? this.getDependencyEmbed() : this.getDefaultEmbed(),
      ],
    });
  }

  public override async getCommandBuilder(): Promise<Pick<SlashCommandBuilder, "toJSON">> {
    this.logger.debug("Reading package.json...");
    this.packageJSON = await getPackageJSON();
    return new SlashCommandBuilder()
      .setName(this.getName())
      .setDescription("Shows info about bot!")
      .addBooleanOption(
        new SlashCommandBooleanOption()
          .setName("dependencies")
          .setDescription("Set this to true if you want to see what dependencies this bot uses!")
          .setRequired(false)
      );
  }
}
