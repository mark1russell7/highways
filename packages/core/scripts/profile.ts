// The profile of one router on one fixture: `pnpm run profile --router <name> --fixture <name> [--levels] [--out <file>]`.
// It prints the functions that take the most time (self time) and can keep the raw profile for a viewer.
// The router `site` is the router of the example boards. With `--levels`, the profile covers only the level links of the result.
import { writeFileSync } from "node:fs";
import { Session } from "node:inspector/promises";
import { FIXTURES, makeFixture } from "../src/fixtures.ts";
import { levelLinks } from "../src/levels.ts";
import type { Router } from "../src/model.ts";
import { ROUTERS, sectionsRouter } from "../src/routers/index.ts";

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
// The options of the router of the example boards.
const SITE = { name: "site", margin: 20, stretch: 3, cap: 6 };
const routers: readonly Router[] = [...ROUTERS, sectionsRouter(SITE)];
const router = routers.find((r) => r.name === (opt("--router") ?? "sections"));
const spec = FIXTURES.find((f) => f.name === (opt("--fixture") ?? "mid-clustered"));
const levels = args.includes("--levels");
if (!router || !spec) {
  console.error(`Routers: ${routers.map((r) => r.name).join(", ")}\nFixtures: ${FIXTURES.map((f) => f.name).join(", ")}`);
  process.exit(2);
}
const graph = makeFixture(spec);
// With `--levels`, the route runs before the profile. The profile then covers the level links of each level with groups.
const groups = levels ? (router.route(graph).levels ?? []).slice(0, -1) : [];
const session = new Session();
session.connect();
await session.post("Profiler.enable");
await session.post("Profiler.setSamplingInterval", { interval: 200 });
await session.post("Profiler.start");
const t = performance.now();
if (levels)
  for (const level of groups) {
    const pairs = level.links.map((l) => ({ source: l.source, target: l.target, count: l.count }));
    levelLinks(level.items, pairs, router.name === "site" ? SITE : {});
  }
else router.route(graph);
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
const part = levels ? `The level links of ${groups.length} levels of ` : "";
console.log(`${part}${router.name} on ${spec.name} (${graph.nodes.length} nodes, ${graph.edges.length} edges): ${Math.round(ms)} ms\n`);
console.log("| self % | function |\n|---:|---|");
for (const [key, hits] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 30)) {
  console.log(`| ${((100 * hits) / total).toFixed(1)} | ${key} |`);
}
const out = opt("--out");
if (out) writeFileSync(out, JSON.stringify(profile));
