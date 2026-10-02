// Captures the deliverable screenshots of the Front Page for each role.
//   node scripts/capture.mjs [baseUrl]          (dev or prod server must be running)
// Writes docs/screens/front-page-<role>-<size>[-dark].png.
import { mkdirSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3100";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCREENS = "docs/screens";
mkdirSync(SCREENS, { recursive: true });

// No provider id: the provider view defaults to the first treating provider.
const ROLES = { firm: "", provider: "?role=provider", client: "?role=client" };
const SIZES = { desktop: { width: 1440, height: 900 }, tablet: { width: 820, height: 1180 } };

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

async function shoot(role, size, scheme) {
  const page = await browser.newPage({ viewport: SIZES[size], colorScheme: scheme });
  await page.goto(`${BASE}/${ROLES[role]}`);
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2200);
  // Walk the page once so scroll-triggered reveals have fired, then capture full height.
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < h; y += 700) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(160);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(900);
  const file = `${SCREENS}/front-page-${role}-${size}${scheme === "dark" ? "-dark" : ""}.png`;
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  console.log("shot", file);
}

for (const role of Object.keys(ROLES)) {
  for (const size of Object.keys(SIZES)) await shoot(role, size, "light");
  await shoot(role, "desktop", "dark");
}
await browser.close();
