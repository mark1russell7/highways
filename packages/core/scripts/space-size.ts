// The record SPACE-SIZE: the count of the base configs of `routeSpace` with 3 levels for each numeric param, from `spaceSize` of `layout-contract`.
// The count takes 1 s in CI. Write the record from the root of the repository: `node packages/core/scripts/space-size.ts <file>`.
import { cpus } from "node:os";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { spaceSize } from "@mark1russell7/layout-contract";
import { routeSpace } from "../src/route-space.ts";
import { SPACE_SIZE_LEVELS, SPACE_SIZE_SCHEMA, spaceDigest, stageCounts, type SpaceSizeRecord } from "./space-size-rows.ts";

const OUT = process.argv[2] ?? "out/space-size/record.json";
const started = performance.now();
const size = spaceSize(routeSpace, { levels: SPACE_SIZE_LEVELS });
const record: SpaceSizeRecord = {
  schema: SPACE_SIZE_SCHEMA,
  space: routeSpace.engine,
  digest: spaceDigest(routeSpace),
  levels: SPACE_SIZE_LEVELS,
  stages: stageCounts(routeSpace),
  constraints: routeSpace.constraints?.length ?? 0,
  base: size.base.toString(),
  meta: size.meta === null ? null : size.meta.toString(),
  seconds: Math.round((performance.now() - started) / 1000),
  cpu: cpus()[0]?.model ?? "unknown",
  date: new Date().toISOString().slice(0, 10),
  run: process.env["GITHUB_RUN_ID"] ?? null,
  commit: process.env["GITHUB_SHA"] ?? null,
};
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(record, null, 1)}\n`);
console.log(`${record.space}: ${record.base} base configs, meta ${record.meta ?? "over the limit"}, in ${record.seconds} s`);
