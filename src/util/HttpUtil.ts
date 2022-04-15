import http from "http";
import https from "https";
import { Readable } from "stream";

export interface Resource {
  url: string;
  headers: { [key: string]: undefined | string | string[] };
  stream: Readable;
}

export function getResource(url: string): Promise<Resource> {
  return new Promise((resolve, reject) => {
    let get: typeof http.get;
    if (url.startsWith("https:")) {
      get = https.get;
    } else if (url.startsWith("http:")) {
      get = http.get;
    } else {
      throw new Error("Invalid URL");
    }

    get(url, res => {
      if (res.statusCode !== 200) {
        reject(new Error(`Request failed with status code ${res.statusCode}`));
      }

      resolve({
        url,
        headers: res.headers,
        stream: res,
      });
    })
      .on("error", reject)
      .end();
  });
}
