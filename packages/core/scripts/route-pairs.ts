/**
 * This script writes the record `route-pairs/2`. The module `route-pairs-rows.ts` makes the rows and tells what they hold.
 * The first argument is the out file.
 * With the second argument `--screen`, the script also reads the set `screen-v3` for samples and the time of the count. Start this form only in CI: a local machine gives no time for a record.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { cpus } from "node:os";
import { dirname } from "node:path";
import { median } from "@mark1russell7/rigor-statistics";
import { measureQuality, routePairCrossings } from "../src/bench/quality.ts";
import { SCREEN_SETS } from "../src/bench/screen/set.ts";
import { boardRows, NAMES, PAIR_FAMILIES, pairsRecord, routerOf } from "./route-pairs-rows.ts";

const OUT = process.argv[2] ?? "out/route-pairs.json";
const ROUNDS = 9;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(pairsRecord(boardRows(PAIR_FAMILIES, undefined, (line) => console.log(line))), null, 1)}\n`);

if (process.argv[3] === "--screen") {
  const routers = NAMES.map((name) => {
    let estimated = 0;
    let boards = 0;
    let largest: { readonly routes: Parameters<typeof routePairCrossings>[0]; readonly family: string; readonly seed: number } | undefined;
    for (const family of SCREEN_SETS["screen-v3"]!.families) {
      for (let seed = 0; seed < family.seeds; seed++) {
        const board = family.make(seed);
        const result = routerOf(name).route(board);
        boards++;
        if (measureQuality(board, result).crossingsEstimated || routePairCrossings(result.routes).estimated) estimated++;
        const size = (routes: typeof result.routes): number => routes.reduce((s, r) => s + r.points.length, 0);
        if (!largest || size(result.routes) > size(largest.routes as typeof result.routes)) largest = { routes: result.routes, family: family.name, seed };
      }
    }
    const times: number[] = [];
    for (let round = 0; round < ROUNDS; round++) {
      const start = performance.now();
      routePairCrossings(largest!.routes);
      times.push(performance.now() - start);
    }
    console.log(name, boards, estimated, median(times));
    return { router: name, boards, estimated, largest: { family: largest!.family, seed: largest!.seed }, medianMs: median(times), rounds: ROUNDS };
  });
  writeFileSync(`${OUT.replace(/\.json$/, "")}.screen.json`, `${JSON.stringify({ schema: "route-pairs-screen/1", cpu: cpus()[0]?.model, routers }, null, 1)}\n`);
}
