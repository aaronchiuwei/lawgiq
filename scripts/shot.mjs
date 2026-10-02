// Screenshot helper.
// node scripts/shot.mjs <url> <outPrefix> [width] [height] [scheme] [targets]
// targets: comma list of scrollY numbers or #ids (default "0"); writes <outPrefix>-<i>.png
import { chromium } from "playwright-core";
const [url, out, w = "1440", h = "900", scheme = "light", targets = "0"] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, colorScheme: scheme });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(2000);
let i = 0;
for (const t of targets.split(",")) {
  if (t.startsWith("#")) await page.evaluate((id) => document.querySelector(id)?.scrollIntoView({ block: "start" }), t);
  else if (t.startsWith("+")) await page.evaluate((dy) => window.scrollBy(0, dy), Number(t.slice(1)));
  else await page.evaluate((y) => window.scrollTo(0, y), Number(t));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${out}-${i++}.png` });
}
if (errors.length) console.log("ERRORS:", [...new Set(errors)].slice(0, 6).join("\n"));
await browser.close();
