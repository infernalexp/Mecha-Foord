import { SlashCommandBooleanOption, SlashCommandBuilder, SlashCommandStringOption } from "@discordjs/builders";
import chalk from "chalk";
import { CommandInteraction, MessageEmbed } from "discord.js";
import ms from "ms";
import { Bot } from "../Bot";
import { Command } from "./Command";

export interface Reminder {
  timestamp: number;
  message?: string;
  ping: boolean;
  pingId?: string;
  channel: string;
}

export class ReminderCommand extends Command {
  // @ts-ignore i know this isn't used anywhere but just in case... y'know?
  private reminderInterval: NodeJS.Timeout;

  public constructor(client: Bot) {
    super(client);
  }

  private get reminders(): Reminder[] {
    return this.database.get("remind", []).value();
  }

  private set reminders(value: Reminder[]) {
    this.database.set("remind", value).write();
  }

  private checkReminders(): void {
    let sentReminders = false;
    for (const reminder of this.reminders) {
      if (reminder.timestamp <= Date.now()) {
        if (this.reminders.length === 1) {
          this.reminders = [];
        } else {
          this.reminders = this.reminders.splice(this.reminders.indexOf(reminder), 1);
        }
        this.sendReminder(reminder).catch(err => this.logger.error("Error sending reminder", err));
        sentReminders = true;
      }
    }

    if (sentReminders) {
      this.logger.debug("Reminders sent, saving database...");
      this.updateDatabase();
    }
  }

  private async sendReminder(reminder: Reminder): Promise<void> {
    const channel = await this.client.channels.fetch(reminder.channel);
    if (!channel) {
      this.logger.error(chalk`Error sending reminder: Could not find channel {yellow ${reminder.channel}}`);
      return;
    }
    if (!channel.isText()) {
      this.logger.error(chalk`Error sending reminder: Channel {yellow ${reminder.channel}} is not a text channel`);
      return;
    }

    try {
      channel.send({
        embeds: [
          new MessageEmbed()
            .setColor("BLUE")
            .setTitle("Reminder")
            .setDescription(reminder.message || "You have a reminder!"),
        ],
        content: reminder.ping ? `<@${reminder.pingId}>` : undefined,
      });
    } catch (err) {
      throw err;
    }
  }

  private updateDatabase(): void {
    this.database
      .write()
      .then(() => this.logger.debug("Database saved!"))
      .catch((err: any) => this.logger.error("Error saving database:", err));
  }

  public override getName(): string {
    return "reminder";
  }

  public override async exec(interaction: CommandInteraction): Promise<void> {
    if (!interaction.isCommand()) return;
    let timeString = interaction.options.getString("time", true);
    const time = ms(timeString.replace(/^in/g, "").trim());
    if (typeof time === "undefined" || time <= 0) {
      let embed: MessageEmbed;
      if (typeof time === "undefined") {
        embed = new MessageEmbed()
          .setColor("RED")
          .setTitle("Invalid time")
          .setDescription(`The time \`${timeString}\` could not be parsed.`);
      }

      if (time <= 0) {
        embed = new MessageEmbed()
          .setColor("RED")
          .setTitle(time < 0 ? "I can't time travel!" : "Invalid time")
          .setDescription(`The time \`${timeString}\` is not valid.`);
      }

      this.logger.error(chalk`Something went wrong when parsing the time {yellow "${timeString}"}`);
      embed = new MessageEmbed()
        .setColor("RED")
        .setTitle("Invalid time")
        .setDescription(`The time \`${timeString}\` is not valid.`);

      interaction.reply({
        embeds: [embed],
      });

      return;
    }

    const ping = interaction.options.getBoolean("ping", false) ?? true;
    let pingId: string | undefined;
    if (ping) {
      pingId = interaction.user.id;
    }
    const message = interaction.options.getString("message", false);

    const reminders = this.reminders;
    reminders.push({
      timestamp: Date.now() + time,
      message: message ?? undefined,
      ping,
      pingId: pingId ?? undefined,
      channel: interaction.channelId,
    });
    this.reminders = reminders;

    this.logger.debug("Added reminder, saving database...");
    this.updateDatabase();

    interaction.reply({
      embeds: [
        new MessageEmbed()
          .setTitle("Reminder set!")
          .setDescription(`I will remind you in this channel <t:${Math.floor((Date.now() + time) / 1000)}:R>`)
          .setColor("BLUE")
          .setFooter({ text: "Reminders are accurate to 30 second intervals." }),
      ],
    });
  }

  public override async getCommandBuilder(): Promise<Pick<SlashCommandBuilder, "toJSON">> {
    this.reminderInterval = setInterval(() => this.checkReminders(), 1000);
    return new SlashCommandBuilder()
      .setName(this.getName())
      .setDescription("Reminds you in a certain amount of time.")
      .addStringOption(
        new SlashCommandStringOption().setName("time").setDescription("The time to remind you in.").setRequired(true)
      )
      .addStringOption(
        new SlashCommandStringOption().setName("message").setDescription("The message to send.").setRequired(false)
      )
      .addBooleanOption(
        new SlashCommandBooleanOption()
          .setName("ping")
          .setDescription("Pings you when the reminder is sent. Defaults to true")
          .setRequired(false)
      );
  }
}
