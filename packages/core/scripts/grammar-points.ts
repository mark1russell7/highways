// The points of the first grammar screen (D23-POINTS): a seeded sample of `routeSpace`, written as one file for the jobs of the screen.
// Write the file from the root of the repository: `node packages/core/scripts/grammar-points.ts <file> [n] [seed] [shards]`.
// The defaults are 1000 points, the seed 1 and 8 shards. Each job of the screen reads its shard with `readShard`.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { routeSpace } from "../src/route-space.ts";
import { pointsFile } from "./grammar-points-rows.ts";

const [out = "out/grammar-points/points.json", n = "1000", seed = "1", shards = "8"] = process.argv.slice(2);
const file = pointsFile(routeSpace, { n: Number(n), seed: Number(seed), shards: Number(shards) });
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(file)}\n`);
console.log(`${file.space}: ${file.points.length} points, seed ${file.seed}, ${file.shards} shards, in ${out}`);
