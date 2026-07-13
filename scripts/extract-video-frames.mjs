/* global process, document, console */
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const videoPath = process.argv[2];
const outputDir = process.argv[3] ?? "video_frames_20260709";
const count = Number(process.argv[4] ?? 24);

if (!videoPath) {
  throw new Error("Usage: node extract-video-frames.mjs <video-path> [output-dir] [count]");
}

await fs.mkdir(outputDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe",
});

try {
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
    deviceScaleFactor: 1,
  });

  const src = pathToFileURL(videoPath).href;
  await page.setContent(
    `<!doctype html>
<html>
  <body style="margin:0;background:#111;display:flex;align-items:center;justify-content:center;width:100vw;height:100vh;overflow:hidden">
    <video id="v" src="${src}" controls style="width:100vw;height:100vh;object-fit:contain"></video>
  </body>
</html>`,
    { waitUntil: "domcontentloaded" },
  );

  await page.waitForFunction(
    () => {
      const video = document.querySelector("video");
      return video && Number.isFinite(video.duration) && video.duration > 0;
    },
    null,
    { timeout: 60_000 },
  );

  const duration = await page.$eval("video", (video) => video.duration);
  const times = Array.from({ length: count }, (_, index) => {
    if (count === 1) return 0;
    return Math.max(0, Math.min(duration - 0.25, (duration * index) / (count - 1)));
  });

  const files = [];
  for (const [index, time] of times.entries()) {
    await page.$eval(
      "video",
      (video, nextTime) => {
        video.pause();
        video.currentTime = nextTime;
      },
      time,
    );
    await page
      .waitForFunction(
        (nextTime) => Math.abs(document.querySelector("video").currentTime - nextTime) < 0.35,
        time,
        { timeout: 20_000 },
      )
      .catch(() => {});
    await page.waitForTimeout(800);

    const filename = `frame_${String(index).padStart(2, "0")}_${Math.floor(time)}s.png`;
    const target = path.join(outputDir, filename);
    await page.screenshot({ path: target, fullPage: false });
    files.push({ time, file: target });
  }

  console.log(JSON.stringify({ duration, files }, null, 2));
} finally {
  await browser.close();
}
