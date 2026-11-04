// One digest for each default router over the 150 boards of `screen-v3`. Two commits with the same digests give the same route bytes.
// Run from `packages/core`: `node scripts/default-digest.ts <out.json>`. The variable `ROUTERS` names other routers of `ALL_STRATEGIES`, with commas.
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { SCREEN_SETS, screenInputs } from "../src/bench/screen/index.ts";
import { inputGraph } from "../src/bench/screen/forms.ts";
import { listStrategies, type AnyStrategy } from "../src/strategies/model.ts";
import { ALL_STRATEGIES } from "../src/strategies/opt-in.ts";
import { STRATEGIES } from "../src/strategies/builtins.ts";

const out = process.argv[2];
const inputs = screenInputs(SCREEN_SETS["screen-v3"]!);
const names = process.env["ROUTERS"]?.split(",");
const routers = (names ? listStrategies(ALL_STRATEGIES, "router").filter((s) => names.includes(s.name)) : listStrategies(STRATEGIES, "router")) as readonly AnyStrategy[];
const digests: Record<string, string> = {};
for (const router of routers) {
  const hash = createHash("sha256");
  const run = router.run as (graph: unknown, options: object) => unknown;
  for (const input of inputs) hash.update(`${input.id}\n${JSON.stringify(run(inputGraph(input), router.defaults))}\n`);
  digests[router.name] = hash.digest("hex").slice(0, 16);
  console.log(router.name, digests[router.name]);
}
const record = { set: "screen-v3", boards: inputs.length, routers: routers.map((r) => r.name), digests };
if (out) writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`);
