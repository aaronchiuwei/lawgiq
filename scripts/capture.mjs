// Captures the deliverable screenshots and animation clips.
//   node scripts/capture.mjs [baseUrl]          (dev or prod server must be running)
// Writes docs/screens/*.png, docs/motion/*.gif, and index thumbnails to public/screens.
import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3100";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCREENS = "docs/screens";
const MOTION = "docs/motion";
const TMP = "docs/.video-tmp";
for (const d of [SCREENS, MOTION, "public/screens", TMP]) mkdirSync(d, { recursive: true });

const OPTIONS = ["option-a", "option-b", "option-c"];
const SCHEME = { "option-a": "light", "option-b": "light", "option-c": "dark" };
const PROVIDER = "contact-mcculloch";
const ROLES = { firm: "", provider: `?role=provider&provider=${PROVIDER}`, client: "?role=client" };
const SIZES = { desktop: { width: 1440, height: 900 }, tablet: { width: 820, height: 1180 } };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function settle(page, ms = 2200) {
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(ms);
}

/* ------------------------------------------------------------ screenshots -- */
for (const opt of OPTIONS) {
  for (const [role, q] of Object.entries(ROLES)) {
    for (const [size, viewport] of Object.entries(SIZES)) {
      const page = await browser.newPage({ viewport, colorScheme: SCHEME[opt] });
      await page.goto(`${BASE}/${opt}${q}`);
      await settle(page);
      const file = `${SCREENS}/${opt}-${role}-${size}.png`;
      // Story pins sections; a full-page capture of a pinned page is misleading,
      // so Story firm gets viewport captures at each chapter instead.
      if (opt === "option-b" && role === "firm") {
        await page.screenshot({ path: file });
        if (size === "desktop") {
          for (const id of ["summary", "money", "action", "timeline", "medical", "strength"]) {
            await page.evaluate((i) => document.getElementById(i)?.scrollIntoView({ block: "start" }), id);
            await page.waitForTimeout(1400);
            await page.screenshot({ path: `${SCREENS}/${opt}-firm-desktop-${id}.png` });
          }
        }
      } else {
        // Walk the page once so scroll-triggered reveals have fired, then capture full height.
        const h = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < h; y += 700) {
          await page.evaluate((yy) => window.scrollTo(0, yy), y);
          await page.waitForTimeout(160);
        }
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(900);
        await page.screenshot({ path: file, fullPage: true });
      }
      if (role === "firm" && size === "desktop") {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.waitForTimeout(500);
        await page.screenshot({ path: `public/screens/${opt}-firm-desktop.png` });
      }
      await page.close();
      console.log("shot", file);
    }
  }
}
// Dark-mode firm captures for the two dark-aware light options.
for (const opt of ["option-a", "option-b"]) {
  const page = await browser.newPage({ viewport: SIZES.desktop, colorScheme: "dark" });
  await page.goto(`${BASE}/${opt}`);
  await settle(page);
  await page.screenshot({ path: `${SCREENS}/${opt}-firm-desktop-dark.png` });
  await page.close();
}

/* ------------------------------------------------------------- recordings -- */
// Records via Chrome's CDP screencast (no Playwright ffmpeg needed), then
// assembles the frames with their real timings into a GIF using system ffmpeg.
async function record(name, opt, scheme, script) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, colorScheme: scheme });
  await page.goto(`${BASE}/${opt}`, { waitUntil: "domcontentloaded" });
  const cdp = await page.context().newCDPSession(page);
  const dir = path.join(TMP, name);
  mkdirSync(dir, { recursive: true });
  const frames = [];
  cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
    const file = path.join(dir, `f${String(frames.length).padStart(5, "0")}.jpg`);
    frames.push({ file, t: metadata.timestamp });
    writeFileSync(file, Buffer.from(data, "base64"));
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", { format: "jpeg", quality: 85, everyNthFrame: 1 });
  await script(page);
  await cdp.send("Page.stopScreencast");
  await page.close();
  // concat list with per-frame durations
  const lines = [];
  frames.forEach((f, i) => {
    const next = frames[i + 1]?.t ?? f.t + 0.5;
    lines.push(`file '${path.resolve(f.file)}'`, `duration ${Math.max(0.02, next - f.t).toFixed(3)}`);
  });
  lines.push(`file '${path.resolve(frames.at(-1).file)}'`);
  const list = path.join(dir, "list.txt");
  writeFileSync(list, lines.join("\n"));
  execFileSync("ffmpeg", [
    "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list,
    "-vf", "fps=15,scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4",
    `${MOTION}/${name}.gif`,
  ]);
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", list, "-vf", "fps=30,scale=1280:-2", "-pix_fmt", "yuv420p", `${MOTION}/${name}.mp4`]);
  console.log("recorded", name, frames.length, "frames");
}

const wheel = async (page, total, step = 120, pause = 40) => {
  await page.mouse.move(640, 420);
  for (let d = 0; d < total; d += step) {
    await page.mouse.wheel(0, step);
    await page.waitForTimeout(pause);
  }
};

await record("option-a-briefing", "option-a", "light", async (page) => {
  await page.waitForTimeout(2600); // composed entrance + count-ups
  await page.evaluate(() => document.getElementById("story-h")?.scrollIntoView({ block: "start", behavior: "smooth" }));
  await page.waitForTimeout(2400); // timeline draws itself
  await page.getByRole("button", { name: /Show the full chronology/ }).click();
  await page.waitForTimeout(1400);
  await page.locator(".source-chip").first().click();
  await page.waitForTimeout(1600); // source drawer
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
});

await record("option-b-story", "option-b", "light", async (page) => {
  await page.waitForTimeout(2400); // hero entrance
  await wheel(page, 1700, 100, 60); // hero collapses, summary lights up
  await page.waitForTimeout(400);
  await page.evaluate(() => document.getElementById("money")?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(900);
  await wheel(page, 2200, 90, 50); // coverage bar + specials stack grows (pinned)
  await page.evaluate(() => document.getElementById("timeline")?.scrollIntoView({ block: "start" }));
  await page.waitForTimeout(700);
  await wheel(page, 3200, 100, 45); // horizontal scrub through 2023 to now
  await page.waitForTimeout(600);
  await page.getByRole("link", { name: "Summary" }).click(); // instant jump via mini-nav
  await page.waitForTimeout(1200);
});

await record("option-c-command", "option-c", "dark", async (page) => {
  await page.waitForTimeout(1800); // tile stagger
  await page.getByRole("radio", { name: "Money" }).click(); // lens: FLIP reflow
  await page.waitForTimeout(1300);
  await page.getByRole("radio", { name: "Everything" }).click();
  await page.waitForTimeout(1300);
  await page.getByRole("button", { name: "Expand Timeline" }).click(); // tile expands to full width
  await page.waitForTimeout(1500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1000);
  await page.keyboard.press("Meta+k"); // palette (no animation by design)
  await page.waitForTimeout(500);
  await page.keyboard.type("coverage", { delay: 70 });
  await page.waitForTimeout(700);
  await page.keyboard.press("Enter"); // jump to tile / open record
  await page.waitForTimeout(1800);
});

rmSync(TMP, { recursive: true, force: true });
await browser.close();
console.log("done");
