// The profile of one router on one fixture: `pnpm run profile --router <name> --fixture <name> [--out <file>]`.
// It prints the functions that take the most time (self time) and can keep the raw profile for a viewer.
import { writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { FIXTURES, makeFixture } from "../src/fixtures.ts";
import { ROUTERS } from "../src/routers/index.ts";

interface ProfileNode {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  hitCount?: number;
}

const args = process.argv.slice(2);
const opt = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const router = ROUTERS.find((r) => r.name === (opt("--router") ?? "sections"));
const spec = FIXTURES.find((f) => f.name === (opt("--fixture") ?? "mid-clustered"));
if (!router || !spec) {
  console.error(`Routers: ${ROUTERS.map((r) => r.name).join(", ")}\nFixtures: ${FIXTURES.map((f) => f.name).join(", ")}`);
  process.exit(2);
}
const graph = makeFixture(spec);
const session = new Session();
session.connect();
await session.post("Profiler.enable");
await session.post("Profiler.setSamplingInterval", { interval: 200 });
await session.post("Profiler.start");
const t = performance.now();
router.route(graph);
const ms = performance.now() - t;
const { profile } = (await session.post("Profiler.stop")) as { profile: { nodes: ProfileNode[] } };
session.disconnect();

const self = new Map<string, number>();
let total = 0;
for (const n of profile.nodes) {
  const hits = n.hitCount ?? 0;
  if (hits === 0) continue;
  const f = n.callFrame;
  const file = f.url.split("/").pop() ?? f.url;
  const key = `${f.functionName || "(anonymous)"} ${file}:${f.lineNumber + 1}`;
  self.set(key, (self.get(key) ?? 0) + hits);
  total += hits;
}
console.log(`${router.name} on ${spec.name} (${graph.nodes.length} nodes, ${graph.edges.length} edges): ${Math.round(ms)} ms\n`);
console.log("| self % | function |\n|---:|---|");
for (const [key, hits] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  console.log(`| ${((100 * hits) / total).toFixed(1)} | ${key} |`);
}
const out = opt("--out");
if (out) writeFileSync(out, JSON.stringify(profile));
