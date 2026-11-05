/**
 * This script writes the record `route-tie/1`. The module `route-tie-rows.ts` makes the rows and tells what the record holds.
 * Usage: `node packages/core/scripts/route-tie.ts <out.json>`. A child arm has the usage `route-tie.ts --arm <out.json> <options as JSON>`.
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { HIGHWAYS_FAMILIES } from "../src/families/index.ts";
import {
  armRows,
  BEFORE,
  CHOSEN,
  FLOORS,
  measureFloors,
  NAMES,
  REGENERATE,
  routerRow,
  SCHEMA,
  SEEDS,
  shiftKinds,
  shiftOf,
  SHIFT,
  sliceRows,
  TOLERANCES,
  toleranceRow,
  VECTORS,
  type ArmOptions,
  type ArmRow,
  type RouteTieRecord,
  type Side,
} from "./route-tie-rows.ts";

const SCRIPT = fileURLToPath(import.meta.url);
const HOOK = join(dirname(SCRIPT), "route-tie-hook.ts");

if (process.argv[2] === "--arm") {
  writeFileSync(process.argv[3]!, JSON.stringify(armRows(JSON.parse(process.argv[4]!) as ArmOptions)));
} else {
  const out = process.argv[2];
  if (!out) throw new Error("Usage: node packages/core/scripts/route-tie.ts <out.json>");
  const temp = mkdtempSync(join(tmpdir(), "route-tie-"));

  /** This function gives the text of the search before the rule. A checkout with one commit fetches it first. */
  const beforeFile = (): string => {
    const show = (): ReturnType<typeof spawnSync> => spawnSync("git", ["show", `${BEFORE}:packages/core/src/visibility.ts`], { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    let shown = show();
    if (shown.status !== 0) {
      spawnSync("git", ["fetch", "--depth", "1", "https://github.com/mark1russell7/highways", BEFORE], { encoding: "utf8" });
      shown = show();
    }
    if (shown.status !== 0) throw new Error(`The script cannot read the commit ${BEFORE}: ${String(shown.stderr)}`);
    const file = join(temp, "visibility-before.ts");
    writeFileSync(file, String(shown.stdout));
    return file;
  };
  const before = beforeFile();

  let count = 0;
  /** This function runs one arm in a fresh process, with its own text of the search. */
  const arm = (hook: { readonly before?: boolean; readonly tie?: number; readonly floor?: number }, options: ArmOptions): ArmRow[] => {
    const file = join(temp, `arm-${count++}.json`);
    const env: NodeJS.ProcessEnv = { ...process.env, ROUTE_TIE_HOOK: "1" };
    if (hook.before) env["ROUTE_TIE_BEFORE"] = before;
    if (hook.tie !== undefined) env["ROUTE_TIE_TIE"] = String(hook.tie);
    if (hook.floor !== undefined && hook.floor !== 1) env["ROUTE_TIE_FLOOR"] = String(hook.floor);
    const child = spawnSync(process.execPath, ["--import", pathToFileURL(HOOK).href, SCRIPT, "--arm", file, JSON.stringify(options)], { env, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    if (child.status !== 0) throw new Error(`The arm ${JSON.stringify(hook)} failed: ${child.stderr}`);
    const rows = JSON.parse(readFileSync(file, "utf8")) as ArmRow[];
    rmSync(file);
    return rows;
  };

  const shifts = VECTORS.map((name) => shiftOf(name));
  const corners: ArmOptions = { routers: ["corners"] };

  const chosenCorners = arm({ tie: CHOSEN }, corners);
  const tolerances = TOLERANCES.map((tie) => {
    console.log(`The table: the distance ${tie}.`);
    return toleranceRow(
      tie,
      chosenCorners,
      arm({ tie }, corners),
      FLOORS.slice(1).map((floor) => arm({ tie, floor }, corners)),
      shifts.map((shift) => arm({ tie }, { ...corners, shift })),
    );
  });

  const all: ArmOptions = { routers: NAMES };
  const side = (hook: { readonly before?: boolean }, options: ArmOptions): Side => ({
    // The law reads the routes alone, so only the arm at the floor 1 and the shifts read the measures.
    floors: FLOORS.map((floor) => arm({ ...hook, floor }, floor === 1 ? options : all)),
    shifts: shifts.map((shift) => arm(hook, { ...options, shift })),
  });
  console.log("The routers: the search before the rule.");
  const old = side({ before: true }, all);
  console.log("The routers: the search with the rule, with the measures.");
  const now = side({}, { ...all, measures: true });

  const record: RouteTieRecord = {
    schema: SCHEMA,
    regenerate: REGENERATE,
    before: BEFORE,
    chosen: CHOSEN,
    shift: SHIFT,
    vectors: [...VECTORS],
    boards: HIGHWAYS_FAMILIES.length * SEEDS,
    choice: "The distance 1e-9 is a choice from the table. It stands far above the rounding of a sum of lengths, and each row of the table on each side of it reads the law.",
    predictionNote:
      "The outcome routes-moved-under-8pct-of-routes named no router, so it reads against the widest row and misses on shared-all. It should have named a router. The rows of this record give the moves of each router.",
    tolerances,
    routers: NAMES.map((router) => routerRow(router, old, now)),
    shiftKinds: shiftKinds(now.floors[0]!, now.shifts),
    floors: measureFloors(now.floors[0]!, now.shifts),
    slice: sliceRows(),
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(record, null, 1)}\n`);
  rmSync(temp, { recursive: true, force: true });
}
