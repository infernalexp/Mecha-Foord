import { SlashCommandBuilder, SlashCommandStringOption } from "@discordjs/builders";
import { Canvas, Image } from "canvas";
import { Bot } from "../../Bot";
import { BasicImageCommand } from "./BasicImageCommand";

export class GrayscaleCommand extends BasicImageCommand {
  public constructor(client: Bot) {
    super(client);
  }

  public override modifyImage(image: Image, canvas: Canvas): Canvas {
    const ctx = canvas.getContext("2d");
    ctx.drawImage(image, 0, 0);
    const imageData = ctx.getImageData(0, 0, image.width, image.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      data[i] = avg;
      data[i + 1] = avg;
      data[i + 2] = avg;
    }
    ctx.putImageData(imageData, 0, 0);
    return canvas;
  }

  public override getName(): string {
    return "grayscale";
  }

  public override getCommandBuilder(): Pick<SlashCommandBuilder, "toJSON"> {
    return new SlashCommandBuilder()
      .setName(this.getName())
      .setDescription("Converts an image to grayscale")
      .addStringOption(
        new SlashCommandStringOption()
          .setName("url")
          .setDescription("The url of the image to convert. May be a link to a message")
          .setRequired(false)
      );
  }
}
