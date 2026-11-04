/**
 * The probe of the home page. The site check of the Pages workflow starts it in a browser at each width, before the
 * deploy. A failed check stops the deploy.
 *
 * The probe drives the map. The worker routes a board with the real routers, the map draws the routes, another router
 * gives other measures, and another board gives another size.
 *
 * The site check reads this TypeScript file directly. It removes the types and the `export` line, and it starts the
 * result as the body of an async function.
 */

// The site check gives these helpers to the probe.
declare const check: (name: string, ok: unknown, detail?: unknown) => boolean;
declare const until: <T>(fn: () => T | Promise<T>, ms?: number) => Promise<T>;
declare const $: (selector: string) => Element | null;
declare const $$: (selector: string) => Element[];
declare const click: (target: string | Element) => void;

/** A route of a small board takes less than a second here, so a slow runner gets a large margin. */
const ROUTE_MS = 30000;

const text = (selector: string): string => $(selector)?.textContent ?? "";
/** This function gives the value of a row of the measures, or an empty text before the route ends. */
const stat = (label: string): string => $$("#stats dt").find((dt) => dt.textContent === label)?.nextElementSibling?.textContent ?? "";

/** This function gives a short sum of the pixels of the map, and the count of the colors in that sample. */
function pixels(): { readonly sum: number; readonly colors: number } {
  const canvas = $("#map") as HTMLCanvasElement | null;
  const data = canvas?.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height).data;
  if (data === undefined) return { sum: 0, colors: 0 };
  const colors = new Set<number>();
  let sum = 0;
  for (let i = 0; i < data.length; i += 4 * 97) {
    const color = (data[i]! << 16) + (data[i + 1]! << 8) + data[i + 2]!;
    colors.add(color);
    sum = (sum * 31 + color) % 1000000007;
  }
  return { sum, colors: colors.size };
}

// The first route: the page starts it at load, with the router `shared`.
check("the page has the routers", await until(() => $$("#routers [data-router]").length >= 3), $$("#routers [data-router]").length);
check("the first route ends", await until(() => stat("Time") !== "", ROUTE_MS), text("#status"));
check("the router does not fail", !text("#status").includes("failed"), text("#status"));
check("the route breaks no rule", stat("Broken rules") === "0", stat("Broken rules"));
check("the router gives shared segments", /^[1-9][\d,]* shared segments/.test(text("#bundle-hint")), text("#bundle-hint"));
check("the map draws the routes", await until(() => pixels().colors > 3), pixels().colors);

// On a phone, the row of the routers scrolls. The chosen router stays in view after the web font loads.
const inView = (): boolean => {
  const row = ($("#routers") as Element).getBoundingClientRect();
  const chosen = $('#routers [aria-checked="true"]')?.getBoundingClientRect();
  return chosen !== undefined && chosen.left >= row.left - 1 && chosen.right <= row.right + 1;
};
await document.fonts.ready;
check("the chosen router stays in view", await until(inView), $('#routers [aria-checked="true"]')?.getBoundingClientRect().left);

// A zoom draws the map again.
const atStart = pixels().sum;
click("#zoom-in");
check("a zoom changes the map", await until(() => pixels().sum !== atStart), pixels().sum);

// Another router gives other measures on the same board.
const sharedInk = stat("Ink");
click('[data-router="straight"]');
check("the router straight ends with other measures", await until(() => stat("Time") !== "" && stat("Ink") !== sharedInk, ROUTE_MS), stat("Ink"));
check("the page marks the router", $('[data-router="straight"]')?.getAttribute("aria-checked") === "true", $('[data-router="straight"]')?.outerHTML);
check("the router straight gives no shared segments", text("#bundle-hint").includes("no shared segments"), text("#bundle-hint"));

// Another board gives another size.
const size = stat("Size");
const fixture = $("#fixture") as HTMLSelectElement;
const next = [...fixture.options].find((option) => option.value !== fixture.value && option.value !== "generated");
check("the page has another board", next !== undefined, fixture.options.length);
if (next !== undefined) {
  fixture.value = next.value;
  fixture.dispatchEvent(new Event("change", { bubbles: true }));
}
check("another board has another size", await until(() => stat("Size") !== "" && stat("Size") !== size, ROUTE_MS), stat("Size"));
check("the board routes with no failure", await until(() => stat("Time") !== "" && !text("#status").includes("failed"), ROUTE_MS), text("#status"));

// The site publishes its measures, with the time of the data.
const kpi = (await fetch("kpi.json")
  .then((response) => (response.ok ? response.json() : undefined))
  .catch(() => undefined)) as { project?: string; at?: string; measures?: unknown[] } | undefined;
check("the file of measures names this project", kpi?.project === "highways", kpi?.project);
check("the file of measures has a data time", !Number.isNaN(Date.parse(kpi?.at ?? "")), kpi?.at);
check("the file of measures has 4 measures", kpi?.measures?.length === 4, kpi?.measures?.length);

export {};
