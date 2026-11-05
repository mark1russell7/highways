// The screenshots of the site at 1280 and 390 pixels, in light and dark. The workflow `Shots` starts this file.
// Start: `node packages/site/scripts/shots.ts <out dir> <base url> <page,page>`. The variable `PLAYWRIGHT_DIR` names the folder that holds `playwright-core`.
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** The width of the desktop view. */
const WIDE = 1280;

/** The width of the phone view. */
const PHONE = 390;

/** The time for the worker of a page to draw its boards, in milliseconds. */
const SETTLE_MS = 6000;

/** The time for a canvas to draw after a click, in milliseconds. */
const CLICK_MS = 900;

/** One more picture of the map of a page, after clicks on the elements of `clicks`. The clicks of one view add to the clicks of the views before it. */
export interface MapView {
  readonly name: string;
  readonly clicks: readonly string[];
}

/** The views of the map of each page. They show the stroke of a closed run, the lanes of an open run, and each zoom level. */
export const MAP_VIEWS: Readonly<Record<string, readonly MapView[]>> = {
  "examples.html": [
    { name: "closed-near", clicks: ["#zoom-in", "#zoom-in", "#zoom-in"] },
    { name: "open-fit", clicks: ["#zoom-fit", "#open-all"] },
    { name: "open-near", clicks: ["#zoom-in", "#zoom-in", "#zoom-in"] },
    { name: "far-1", clicks: ["#close-all", "#zoom-fit", "#zoom-out"] },
    { name: "far-2", clicks: ["#zoom-out"] },
    { name: "far-3", clicks: ["#zoom-out"] },
    { name: "far-4", clicks: ["#zoom-out"] },
  ],
};

/** One screenshot: a page at one width and one color scheme. */
export interface Shot {
  readonly page: string;
  readonly width: number;
  readonly height: number;
  readonly phone: boolean;
  readonly colorScheme: "light" | "dark";
  readonly file: string;
}

/** What a page tells after its shot. */
export interface PageState {
  /** The width of the view in pixels. */
  readonly view: number;
  /** The width of the page in pixels. A page wider than its view scrolls to the side. */
  readonly scroll: number;
  /** The messages of the errors that the page threw. */
  readonly errors: readonly string[];
}

/** This function gives the shots of a list of pages with commas between them. */
export function shotPlan(pages: string): readonly Shot[] {
  const names = pages
    .split(",")
    .map((page) => page.trim())
    .filter((page) => page !== "");
  return names.flatMap((page) =>
    [WIDE, PHONE].flatMap((width) =>
      (["light", "dark"] as const).map((colorScheme) => ({
        page,
        width,
        height: width === PHONE ? 844 : 900,
        phone: width === PHONE,
        colorScheme,
        file: `${page.replace(/\.html.*$/, "")}-${width}-${colorScheme}.png`,
      })),
    ),
  );
}

/** This function gives the file of a view of the map. Only the light scheme has views. */
export function mapViewFile(shot: Shot, view: MapView): string | undefined {
  return shot.colorScheme === "light" ? shot.file.replace(/\.png$/, `-${view.name}.png`) : undefined;
}

/** This function gives the line of the report for one shot. */
export function reportLine(shot: Shot, state: PageState): string {
  const fit = state.scroll > state.view ? "OVERFLOW" : "ok";
  return `${shot.file} viewport ${state.view} scrollWidth ${state.scroll} ${fit} errors ${state.errors.length} ${state.errors.join(" | ")}`.trimEnd();
}

/** The part of a tab of `playwright-core` that this file calls. */
interface Tab {
  on(event: "pageerror", listener: (error: Error) => void): void;
  goto(url: string, options: { readonly waitUntil: "networkidle" }): Promise<unknown>;
  waitForTimeout(ms: number): Promise<void>;
  evaluate<T>(read: () => T): Promise<T>;
  screenshot(options: { readonly path: string; readonly fullPage: boolean }): Promise<unknown>;
  click(selector: string): Promise<void>;
  locator(selector: string): { screenshot(options: { readonly path: string }): Promise<unknown> };
}

/** The part of a browser of `playwright-core` that this file calls. */
interface Browser {
  newContext(options: { readonly viewport: { readonly width: number; readonly height: number }; readonly isMobile: boolean; readonly hasTouch: boolean; readonly colorScheme: "light" | "dark" }): Promise<{ newPage(): Promise<Tab>; close(): Promise<void> }>;
  close(): Promise<void>;
}

/** This function takes one shot in a new context, and gives the line of the report. */
async function takeShot(browser: Browser, shot: Shot, base: string, outDir: string): Promise<string> {
  const context = await browser.newContext({ viewport: { width: shot.width, height: shot.height }, isMobile: shot.phone, hasTouch: shot.phone, colorScheme: shot.colorScheme });
  const tab = await context.newPage();
  const errors: string[] = [];
  tab.on("pageerror", (error) => errors.push(error.message));
  await tab.goto(new URL(shot.page, base).href, { waitUntil: "networkidle" });
  await tab.waitForTimeout(SETTLE_MS);
  const size = await tab.evaluate(() => ({ view: innerWidth, scroll: document.documentElement.scrollWidth }));
  await tab.screenshot({ path: join(outDir, shot.file), fullPage: true });
  for (const view of MAP_VIEWS[shot.page] ?? []) {
    const file = mapViewFile(shot, view);
    if (file === undefined) continue;
    for (const selector of view.clicks) await tab.click(selector);
    await tab.waitForTimeout(CLICK_MS);
    await tab.locator("#map").screenshot({ path: join(outDir, file) });
  }
  await context.close();
  return reportLine(shot, { ...size, errors });
}

/** This function takes each shot in the Chrome of the machine, and writes `report.txt`. */
async function main(outDir: string, base: string, pages: string): Promise<void> {
  const load = createRequire(join(process.env["PLAYWRIGHT_DIR"] ?? process.cwd(), "index.js"));
  const { chromium } = load("playwright-core") as { chromium: { launch(options: { readonly channel: string }): Promise<Browser> } };
  mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome" });
  const lines: string[] = [];
  for (const shot of shotPlan(pages)) lines.push(await takeShot(browser, shot, base, outDir));
  await browser.close();
  writeFileSync(join(outDir, "report.txt"), `${lines.join("\n")}\n`);
  console.log(lines.join("\n"));
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const [outDir, base, pages] = process.argv.slice(2);
  if (outDir === undefined || base === undefined || pages === undefined) throw new Error("Give the out dir, the base url and the pages.");
  await main(outDir, base, pages);
}
