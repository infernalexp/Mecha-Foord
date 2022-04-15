import chalk from "chalk";
import { ColorResolvable, Interaction, Message, MessageAttachment, MessageEmbed } from "discord.js";
import { createReadStream, createWriteStream, ensureDir } from "fs-extra";
import path from "path";
import { UpdatableReply } from "../../UpdatableReply";
import { getEncoding } from "../../util/FFmpegUtil";
import { getResource } from "../../util/HttpUtil";
import { asyncPipe, fileExists, fileSize, hash, Promised } from "../../util/Util";
import { Command } from "../Command";

export abstract class ImageCommand extends Command {
  public isValidType(type: string): boolean {
    return type.includes("/") ? type.startsWith("image/") && type !== "image/gif" : type !== "gif";
  }

  public override async exec(interaction: Interaction): Promise<void> {
    if (!(interaction.isMessageContextMenu() || interaction.isCommand())) return;

    const reply = new UpdatableReply(
      interaction,
      data => {
        if (data.state === "success" && data.uploadable === "true") {
          return {
            files: [new MessageAttachment(createReadStream(data.path), data.outputFilename)],
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

    reply.setData("title", "Fetching image URL");
    reply.setData("description", "");
    reply.setData("state", "processing");
    reply.init();

    let url = "";
    if (interaction.isMessageContextMenu()) {
      if (interaction.targetMessage instanceof Message) {
        if (interaction.targetMessage.attachments.size > 0) {
          for (const attachment of interaction.targetMessage.attachments.values()) {
            if (attachment instanceof MessageAttachment) {
              if (attachment.contentType ? this.isValidType(attachment.contentType) : true) {
                reply.addDataLine("log", `Using image from message ${interaction.targetMessage.id}`);
                reply.update();
                url = attachment.url;
                break;
              }
            }
          }
        }
      } else {
        for (const attachment of interaction.targetMessage.attachments) {
          if (attachment.content_type ? this.isValidType(attachment.content_type) : true) {
            reply.addDataLine("log", `Using image from message ${interaction.targetMessage.id}`);
            reply.update();
            url = attachment.url;
            break;
          }
        }
      }
    } else if (interaction.isCommand()) {
      url = interaction.options.getString("url") ?? "";
      if (!url) {
        reply.addDataLine("log", "No URL provided, getting image from channel");
        reply.update();
        // Find latest image from channel
        const channel = await this.client.channels.fetch(interaction.channelId);
        if (channel?.isText()) {
          const messages = await channel.messages.fetch({ limit: 100 });
          outerLoop: for (const message of messages.values()) {
            if (message.attachments.size > 0) {
              for (const attachment of message.attachments.values()) {
                if (attachment.contentType ? this.isValidType(attachment.contentType) : true) {
                  reply.addDataLine("log", `Using image from message ${message.id}`);
                  reply.update();
                  url = attachment.url;
                  break outerLoop;
                }
              }
            }
          }
        }

        if (!url) {
          reply.addDataLine("log", "No image found.");
          reply.setData("state", "error");
          reply.setData("title", "No image found");
          reply.setData(
            "description",
            "No image found in the last 100 messages.\nPlease provide a URL or upload an image to the channel."
          );
          reply.update();
          reply.close();
          return;
        }
      }

      const urlObject = new URL(url);
      if (urlObject.hostname === "discord.com" && urlObject.pathname.startsWith("/channels/" + interaction.guildId)) {
        reply.addDataLine("log", "Resolving message URL");
        reply.update();
        const [channelId, messageId] = urlObject.pathname.split("/").slice(-2);
        let channel = await this.client.channels.fetch(channelId).catch(() => {});
        if (channel?.isText()) {
          const message = await channel.messages.fetch(messageId).catch(() => {});
          if (!message) {
            reply.addDataLine("log", "Message not found");
            reply.setData("state", "error");
            reply.setData("title", "Message not found");
            reply.setData("description", "Message not found");
            reply.update();
            reply.close();
            return;
          }
          if (message.attachments.size > 0) {
            for (const attachment of message.attachments.values()) {
              if (attachment.contentType ? this.isValidType(attachment.contentType) : true) {
                reply.addDataLine("log", `Using image from message ${message.id}`);
                reply.update();
                url = attachment.url;
                break;
              }
            }
          }
        } else {
          reply.addDataLine("log", "Text channel not found");
          reply.setData("state", "error");
          reply.setData("title", "Text channel not found");
          reply.setData("description", "Text channel not found.");
          reply.update();
          reply.close();
          return;
        }
      }
    }

    if (!url) {
      reply.addDataLine("log", "No image found.");
      reply.setData("state", "error");
      reply.setData("title", "No image found");
      reply.setData("description", "");
      reply.update();
      reply.close();
      return;
    }

    reply.setData("title", `Downloading image...`);
    reply.setData("description", "");
    reply.addDataLine("log", `URL: ${url}`);
    reply.update();

    const hashedURL = hash("downloaded_" + url);
    let infile = path.join(process.env.CACHED_FILE_DIR as string, hashedURL);
    let outfile = path.join(process.env.EXPORTED_FILE_DIR as string, hash(this.getName() + "_" + hashedURL));

    if (await fileExists(infile)) {
      reply.addDataLine("log", `Using cached file ${hashedURL}`);
      reply.update();
    } else {
      reply.addDataLine("log", `Cache miss, downloading file ${hashedURL}`);

      const resource = await getResource(url);
      const type = resource.headers["content-type"] as string;
      if (!this.isValidType(type)) {
        resource.stream.destroy();
        reply.addDataLine("log", "Invalid mime type, got " + type);
        reply.setData("title", "Unsupported URL");
        reply.setData("description", "The URL provided does not point to a image.\nPlease provide a URL to a image.");
        reply.setData("state", "error");
        reply.update();
        reply.close();
        return;
      }

      reply.addDataLine("log", "Downloading file...");
      reply.update();
      await asyncPipe(resource.stream, createWriteStream(infile));
      reply.addDataLine("log", "File downloaded");
      reply.update();
    }

    const inencoding = await getEncoding(infile);
    if (!this.isValidType(inencoding)) {
      reply.addDataLine("log", "Invalid encoding, got " + inencoding);
      reply.setData("title", "Unsupported encoding");
      reply.setData(
        "description",
        "The image provided is not in a supported encoding.\nPlease provide a URL to a valid image."
      );
      reply.setData("state", "error");
      reply.update();
      reply.close();
      return;
    }

    const success = await this.convert(infile, outfile, inencoding, reply);

    if (success) {
      if ((await fileSize(outfile)) > 8000000) {
        reply.setData("state", "success");
        reply.setData("title", "Conversion complete");
        reply.setData(
          "description",
          "The image has been transformed.\nUnfortunately the file is too large, you can download the file at:\n" +
            process.env.EXPORTED_FILE_URL +
            path.basename(outfile)
        );
        reply.setData("log", "");
        reply.update();
        reply.close();
      } else {
        reply.setData("state", "success");
        reply.setData("uploadable", "true");
        reply.setData("path", outfile);
        reply.setData("outputFilename", "output." + inencoding);
        reply.update();
        reply.close();
      }
    } else {
      reply.addDataLine("log", "An error occurred");
      reply.setData("state", "error");
      reply.setData("title", "Error");
      reply.setData("description", "An error occurred while running this command.\nPlease try again later.");
      reply.update();
      reply.close();
    }
  }

  protected abstract convert(
    infile: string,
    outfile: string,
    inencoding: string,
    reply: UpdatableReply
  ): Promised<boolean>;

  private static initializedDirectories: boolean = false;
  public override async init(): Promise<void> {
    super.init();
    if (!ImageCommand.initializedDirectories) {
      ImageCommand.initializedDirectories = true;
      if (process.env.CACHED_FILE_DIR) {
        await ensureDir(process.env.CACHED_FILE_DIR);
      } else {
        throw new Error("CACHED_FILE_DIR is not set!");
      }
      if (process.env.EXPORTED_FILE_DIR) {
        await ensureDir(process.env.EXPORTED_FILE_DIR);
      } else {
        throw new Error("EXPORTED_FILE_DIR is not set!");
      }

      this.logger.debug(chalk`Creating directory: {green ${process.env.CACHED_FILE_DIR}}`);
      this.logger.debug(chalk`Creating directory: {green ${process.env.EXPORTED_FILE_DIR}}`);
      await Promise.all([
        ensureDir(process.env.CACHED_FILE_DIR as string),
        ensureDir(process.env.EXPORTED_FILE_DIR as string),
      ]);
    }
  }
}
