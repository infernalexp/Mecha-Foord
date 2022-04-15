import { SlashCommandBuilder, SlashCommandStringOption } from "@discordjs/builders";
import chalk from "chalk";
import { ColorResolvable, Interaction, MessageAttachment, MessageEmbed } from "discord.js";
import ffmpegPath from "ffmpeg-static";
import { createReadStream, createWriteStream, ensureDir } from "fs-extra";
import path from "path";
import { Bot } from "../Bot";
import { UpdatableReply } from "../UpdatableReply";
import { getResource } from "../util/HttpUtil";
import { asyncPipe, asyncProcess, fileExists, fileSize, hash } from "../util/Util";
import { Command } from "./Command";

export class ToGifSlashCommand extends Command {
  public constructor(client: Bot) {
    super(client);
  }

  public override getName(): string {
    return "togif";
  }

  public override async exec(interaction: Interaction): Promise<void> {
    if (!interaction.isCommand()) return;

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

    reply.setData("state", "processing");
    reply.setData("title", "Fetching video URL");
    reply.setData("description", "");
    reply.init();

    let url = interaction.options.getString("url");
    if (!url) {
      reply.addDataLine("log", "No URL provided, getting video from channel");
      reply.update();
      // Find latest video from channel
      const channel = await this.client.channels.fetch(interaction.channelId);
      if (channel?.isText()) {
        const messages = await channel.messages.fetch({ limit: 100 });
        outerLoop: for (const message of messages.values()) {
          if (message.attachments.size > 0) {
            for (const attachment of message.attachments.values()) {
              if (attachment.contentType?.startsWith("video/") ?? true) {
                reply.addDataLine("log", `Using video from message ${message.id}`);
                reply.update();
                url = attachment.url;
                break outerLoop;
              }
            }
          }
        }
      }
    }

    if (!url) {
      reply.addDataLine("log", "No video found.");
      reply.setData("state", "error");
      reply.setData("title", "No video found");
      reply.setData(
        "description",
        "No video found in the last 100 messages.\nPlease provide a URL or upload a video to the channel."
      );
      reply.update();
      reply.close();
      return;
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
            if (attachment.contentType?.startsWith("video/") ?? true) {
              reply.addDataLine("log", `Using video from message ${message.id}`);
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

    url = url.trim();
    await this.processUrl(url, reply);
  }

  protected async processUrl(url: string, reply: UpdatableReply) {
    reply.setData("title", `Downloading video...`);
    reply.setData("description", "");
    reply.addDataLine("log", `URL: ${url}`);
    reply.update();

    const hashedURL = hash("downloaded_" + url);
    const infile = path.join(process.env.CACHED_FILE_DIR as string, hashedURL);
    const outfile = path.join(process.env.EXPORTED_FILE_DIR as string, hash("togif_" + hashedURL) + ".gif");
    if (await fileExists(infile)) {
      reply.addDataLine("log", `Using cached file ${hashedURL}`);
      reply.update();
    } else {
      reply.addDataLine("log", `Cache miss, downloading file ${hashedURL}`);
      if (url.startsWith("https://www.youtube.com/watch?v=") || url.startsWith("https://youtu.be/")) {
        reply.addDataLine("log", "YouTube URL detected");
        reply.setData("title", "Unsupported URL");
        reply.setData("description", "YouTube URLs are not supported at this time.\nPlease provide a URL to a video.");
        reply.setData("state", "error");
        reply.update();
        reply.close();
        return;
      }

      const resource = await getResource(url);
      const type = resource.headers["content-type"] as string;
      if (!type.startsWith("video/")) {
        resource.stream.destroy();
        reply.addDataLine("log", "Expected mime type video/*, got " + type);
        reply.setData("title", "Unsupported URL");
        reply.setData("description", "The URL provided does not point to a video.\nPlease provide a URL to a video.");
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

    reply.setData("title", "Converting video to GIF");
    reply.setData("description", "");
    reply.addDataLine("log", "Converting video to GIF");
    reply.update();

    let exitCode: number;
    if (await fileExists(outfile)) {
      reply.addDataLine("log", `Using cached file ${outfile}`);
      reply.update();
      exitCode = 0;
    } else {
      const out = path.join(__dirname, `../../log/${new Date().toISOString()}_ffmpeg_out.txt`);
      const err = path.join(__dirname, `../../log/${new Date().toISOString()}_ffmpeg_err.txt`);
      this.logger.debug(chalk`Writing FFMPEG output to {yellow ${path.relative(process.cwd(), out)}}`);
      this.logger.debug(chalk`Writing FFMPEG errors to {yellow ${path.relative(process.cwd(), err)}}`);

      exitCode = await asyncProcess(
        ffmpegPath,
        [
          "-filter_complex",
          "[0:v] split [a][b];[a] palettegen=stats_mode=diff [p];[b][p] paletteuse=bayer_scale=1",
          "-i",
          infile,
          "-f",
          "gif",
          "-y",
          outfile,
        ],
        createWriteStream(out),
        createWriteStream(err)
      );
    }

    if (exitCode === 0) {
      if ((await fileSize(outfile)) > 8000000) {
        reply.setData("state", "success");
        reply.setData("title", "Conversion complete");
        reply.setData(
          "description",
          "The video has been converted to a GIF.\nUnfortunately the file is too large, you can download the GIF at:\n" +
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
        reply.update();
        reply.close();
      }
    } else {
      reply.addDataLine("log", "FFmpeg exited with code " + exitCode);
      reply.setData("state", "error");
      reply.setData("title", "FFmpeg error");
      reply.setData("description", "An error occurred while running FFmpeg.\nPlease try again later.");
      reply.update();
      reply.close();
    }
  }

  public override async getCommandBuilder(): Promise<Pick<SlashCommandBuilder, "toJSON">> {
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

    return new SlashCommandBuilder()
      .setName(this.getName())
      .setDescription("Creates a gif from the given video")
      .addStringOption(
        new SlashCommandStringOption()
          .setName("url")
          .setDescription("The url of the video to convert. May be a link to a message")
          .setRequired(false)
      );
  }
}
