// The screenshots of the site at 1280 and 390 pixels, in light and dark. The workflow `Shots` starts this file.
// Start: `node packages/site/scripts/shots.mjs <out dir> <base url> <page,page>`. The variable `PLAYWRIGHT_DIR` names the folder that holds `playwright`.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";

const [outDir, base, pageList] = process.argv.slice(2);
const require = createRequire(join(process.env.PLAYWRIGHT_DIR ?? process.cwd(), "index.js"));
const { chromium } = require("playwright");

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const lines = [];
for (const page of pageList.split(",")) {
  for (const width of [1280, 390]) {
    for (const colorScheme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, isMobile: width === 390, hasTouch: width === 390, colorScheme });
      const tab = await context.newPage();
      const errors = [];
      tab.on("pageerror", (e) => errors.push(e.message));
      await tab.goto(new URL(page, base).href, { waitUntil: "networkidle" });
      await tab.waitForTimeout(6000);
      const size = await tab.evaluate(() => ({ view: innerWidth, scroll: document.documentElement.scrollWidth }));
      const name = `${page.replace(/\.html.*$/, "")}-${width}-${colorScheme}.png`;
      await tab.screenshot({ path: join(outDir, name), fullPage: true });
      lines.push(`${name} viewport ${size.view} scrollWidth ${size.scroll} ${size.scroll > size.view ? "OVERFLOW" : "ok"} errors ${errors.length} ${errors.join(" | ")}`);
      await context.close();
    }
  }
}
await browser.close();
writeFileSync(join(outDir, "report.txt"), `${lines.join("\n")}\n`);
console.log(lines.join("\n"));
