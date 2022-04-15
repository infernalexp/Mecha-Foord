import { spawn } from "child_process";
import ffmpegPath from "ffmpeg-static";
import { path as ffprobePath } from "ffprobe-static";
import { rename } from "fs-extra";
import { asyncProcess } from "./Util";

export async function toFormat(
  inputPath: string,
  outputPath: string,
  format: string,
  outStream?: NodeJS.WritableStream,
  errStream?: NodeJS.WritableStream
): Promise<number> {
  let exitCode = 0;
  if (inputPath !== outputPath + "." + format) {
    exitCode = await asyncProcess(ffmpegPath, ["-i", inputPath, outputPath + "." + format, "-y"], outStream, errStream);
  }

  if (exitCode === 0) {
    await rename(outputPath + "." + format, outputPath);
  }
  return exitCode;
}

export function getEncoding(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const process = spawn(
      ffprobePath,
      [
        "-v",
        "error",
        "-select_streams",
        "v:0",
        "-show_entries",
        "stream=codec_name",
        "-of",
        "default=nokey=1:noprint_wrappers=1",
        path,
      ],
      { stdio: ["ignore", "pipe", "pipe"] }
    );

    const buf: Buffer[] = [];
    process.stdout.on("data", data => {
      buf.push(data);
    });
    process.on("close", code => {
      if (code !== 0) {
        reject(new Error(`FFprobe exited with code ${code}`));
        return;
      }
      const data = Buffer.concat(buf).toString().trim();
      resolve(data);
    });
  });
}
