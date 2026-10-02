// Real-input smoke test: wheel, keyboard and clicks must work on every view.
//   node scripts/smoke.mjs [baseUrl]
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3100";
const browser = await chromium.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
let failed = 0;
const check = (ok, msg) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failed++;
};

for (const opt of ["option-a", "option-b", "option-c"]) {
  for (const q of ["", "?role=provider&provider=contact-mcculloch", "?role=client"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(`${BASE}/${opt}${q}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    await page.mouse.move(700, 500);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(500);
    const y = await page.evaluate(() => window.scrollY);
    check(y > 0, `${opt}${q || " (firm)"}: mouse wheel scrolls (scrollY=${Math.round(y)})`);
    const locked = await page.evaluate(() => getComputedStyle(document.body).overflow === "hidden");
    check(!locked, `${opt}${q || " (firm)"}: body is not scroll-locked`);

    if (!q) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);
      const chip = page.locator(".source-chip, .source-icon, .source-footnote").first();
      await chip.scrollIntoViewIfNeeded();
      await chip.click();
      await page.waitForTimeout(450);
      check((await page.locator('aside[role="dialog"][data-state="open"]').count()) === 1, `${opt}: source drawer opens on click`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(450);
      check((await page.locator('aside[role="dialog"][data-state="open"]').count()) === 0, `${opt}: Escape closes the drawer`);
      await page.mouse.wheel(0, 500);
      await page.waitForTimeout(400);
      check((await page.evaluate(() => window.scrollY)) > 0, `${opt}: page still scrolls after the drawer closes`);
      await page.getByRole("radio", { name: "Client" }).click();
      await page.waitForURL(/role=client/, { timeout: 8000 }).catch(() => {});
      check(page.url().includes("role=client"), `${opt}: role switcher navigates`);
    }
    await page.close();
  }
}
await browser.close();
console.log(failed ? `${failed} checks failed` : "all checks passed");
process.exit(failed ? 1 : 0);
