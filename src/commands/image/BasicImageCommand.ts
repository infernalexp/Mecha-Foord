import { Canvas, createCanvas, Image, loadImage } from "canvas";
import chalk from "chalk";
import { createWriteStream } from "fs-extra";
import path from "path";
import { UpdatableReply } from "../../UpdatableReply";
import { toFormat } from "../../util/FFmpegUtil";
import { asyncPipe, fileExists, Promised } from "../../util/Util";
import { ImageCommand } from "./ImageCommand";

export abstract class BasicImageCommand extends ImageCommand {
  protected override async convert(
    infile: string,
    outfile: string,
    inencoding: string,
    reply: UpdatableReply
  ): Promise<boolean> {
    if (!(await fileExists(infile + ".png"))) {
      reply.setData("title", `Converting image...`);
      reply.setData("description", "");
      reply.addDataLine("log", `Converting image to PNG...`);
      reply.update();

      let out = path.join(__dirname, `../../../log/${new Date().toISOString()}_ffmpeg_out.txt`);
      let err = path.join(__dirname, `../../../log/${new Date().toISOString()}_ffmpeg_err.txt`);
      this.logger.debug(chalk`Writing FFMPEG output to {yellow ${path.relative(process.cwd(), out)}}`);
      this.logger.debug(chalk`Writing FFMPEG errors to {yellow ${path.relative(process.cwd(), err)}}`);
      const exitCode = await toFormat(infile, infile + ".png", "png", createWriteStream(out), createWriteStream(err));
      if (exitCode !== 0) {
        reply.addDataLine("log", "Conversion to PNG failed");
        reply.setData("state", "error");
        reply.setData("title", "Failed to transform image");
        reply.setData("description", "Conversion to PNG failed.\nPlease try again later.");
        reply.update();
        reply.close();
        return false;
      }
    } else {
      reply.addDataLine("log", "Using cached PNG file");
      reply.update();
    }

    if (!(await fileExists(outfile + ".png"))) {
      reply.setData("title", `Transforming image...`);
      reply.setData("description", "");
      reply.addDataLine("log", "Loading image");
      reply.update();
      const image = await loadImage(infile + ".png");

      reply.addDataLine("log", "Transforming image");
      reply.update();
      let canvas = createCanvas(image.width, image.height);
      canvas = await this.modifyImage(image, canvas);

      reply.addDataLine("log", "Writing image");
      reply.update();
      await asyncPipe(canvas.createPNGStream(), createWriteStream(outfile + ".png"));
    } else {
      reply.addDataLine("log", "Using cached transformed image");
      reply.update();
    }

    let exitCode = 0;
    if (!(await fileExists(outfile))) {
      reply.addDataLine("log", "Converting image to " + inencoding);
      reply.update();
      let out = path.join(__dirname, `../../../log/${new Date().toISOString()}_ffmpeg_out.txt`);
      let err = path.join(__dirname, `../../../log/${new Date().toISOString()}_ffmpeg_err.txt`);
      this.logger.debug(chalk`Writing FFMPEG output to {yellow ${path.relative(process.cwd(), out)}}`);
      this.logger.debug(chalk`Writing FFMPEG errors to {yellow ${path.relative(process.cwd(), err)}}`);
      exitCode = await toFormat(outfile + ".png", outfile, inencoding, createWriteStream(out), createWriteStream(err));
    } else {
      reply.addDataLine("log", "Using cached converted image");
      reply.update();
    }

    return exitCode === 0;
  }

  protected abstract modifyImage(image: Image, canvas: Canvas): Promised<Canvas>;
}
