import { ContextMenuCommandBuilder, SlashCommandBuilder } from "@discordjs/builders";
import chalk from "chalk";
import { ColorResolvable, Interaction, Message, MessageAttachment, MessageEmbed } from "discord.js";
import { createReadStream, ensureDir } from "fs-extra";
import { Bot } from "../../Bot";
import { UpdatableReply } from "../../UpdatableReply";
import { ToGifSlashCommand } from "./ToGifSlashCommand";

export class ToGifMessageCommand extends ToGifSlashCommand {
  public constructor(client: Bot) {
    super(client);
  }

  public override getName(): string {
    return "Convert video to GIF";
  }

  public override async exec(interaction: Interaction): Promise<void> {
    if (!interaction.isMessageContextMenu()) return;

    const reply = new UpdatableReply(
      interaction,
      data => {
        if (data.state === "success" && data.uploadable === "true") {
          return {
            files: [new MessageAttachment(createReadStream(data.path), "output.gif")],
            embeds: [],
          };
        } else {
          let description = (data.description ?? "").trim();
          if (process.env.ENVIRONMENT === "DEV" && data.log) {
            description += `\n\n**Log:**\`\`\`\n${data.log}\n\`\`\``;
          }
          const embed = new MessageEmbed()
            .setColor(
              ({
                error: "RED",
                processing: "BLUE",
                success: "GREEN",
              }[data.state] as ColorResolvable) ?? "YELLOW"
            )
            .setTitle(data.title)
            .setDescription(description);
          return { embeds: [embed] };
        }
      },
      500
    );

    reply.setData("title", "Fetching video URL");
    reply.setData("description", "");
    reply.setData("state", "processing");
    reply.init();

    let url = "";
    if (interaction.targetMessage instanceof Message) {
      if (interaction.targetMessage.attachments.size > 0) {
        for (const attachment of interaction.targetMessage.attachments.values()) {
          if (attachment instanceof MessageAttachment) {
            if (attachment.contentType?.startsWith("video/") ?? true) {
              reply.addDataLine("log", `Using video from message ${interaction.targetMessage.id}`);
              reply.update();
              url = attachment.url;
              break;
            }
          }
        }
      }
    } else {
      for (const attachment of interaction.targetMessage.attachments) {
        if (attachment.content_type?.startsWith("video/") ?? true) {
          reply.addDataLine("log", `Using video from message ${interaction.targetMessage.id}`);
          reply.update();
          url = attachment.url;
          break;
        }
      }
    }

    if (!url) {
      reply.addDataLine("log", "No video found.");
      reply.setData("state", "error");
      reply.setData("title", "No video found");
      reply.setData("description", "");
      reply.update();
      reply.close();
      return;
    } else {
      await this.processUrl(url, reply);
    }
  }

  public override async init(): Promise<void> {
    if (!process.env.CACHED_FILE_DIR) {
      throw new Error("CACHED_FILE_DIR is not set");
    }
    if (!process.env.EXPORTED_FILE_DIR) {
      throw new Error("EXPORTED_FILE_DIR is not set");
    }
    if (!process.env.EXPORTED_FILE_URL) {
      throw new Error("EXPORTED_FILE_URL is not set");
    }

    this.logger.debug(chalk`Creating directory: {green ${process.env.CACHED_FILE_DIR}}`);
    this.logger.debug(chalk`Creating directory: {green ${process.env.EXPORTED_FILE_DIR}}`);
    await Promise.all([
      ensureDir(process.env.CACHED_FILE_DIR as string),
      ensureDir(process.env.EXPORTED_FILE_DIR as string),
    ]);
  }

  public override getCommandBuilder(): Pick<SlashCommandBuilder, "toJSON"> {
    return new ContextMenuCommandBuilder().setName(this.getName()).setDefaultPermission(true).setType(3);
  }
}
