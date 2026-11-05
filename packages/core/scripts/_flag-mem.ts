// Probe of ROUTE-TIE, kept on a measure branch. Usage: node --import ./_flag-hook.ts _flag-mem.ts <fixture> <out.json>
// It states the corners of a board, the bytes of the two new arrays, and the peak of the process after the graph and after one route. It reads no clock.
import { writeFileSync } from "node:fs";
import { FIXTURES, makeFixture } from "../src/fixtures.ts";
import { resolvePorts, splitFrames } from "../src/model.ts";
import { WayFinder } from "../src/ways.ts";
import { routerNamed } from "./route-tie-rows.ts";

const name = process.argv[2]!;
const out = process.argv[3]!;
const router = process.argv[4] ?? "corners";
const spec = FIXTURES.find((f) => f.name === name);
if (spec === undefined) throw new Error(`no fixture ${name}`);
const mb = (): number => Math.round((process.resourceUsage().maxRSS / 1024) * 10) / 10;
const row: Record<string, unknown> = { fixture: name, nodes: spec.nodes, edgesPerNode: spec.edgesPerNode, router, arm: process.env["ANCHOR_SOURCE"] ? "B" : "C" };
const save = (): void => {
  writeFileSync(out, JSON.stringify(row, null, 1));
  console.log(JSON.stringify(row));
};
const board = makeFixture(spec);
row["peakMbAfterBoard"] = mb();
save();
const { graph } = splitFrames(resolvePorts(board));
const ways = new WayFinder(graph.nodes);
const corners = ways.corners.points.length;
row["corners"] = corners;
row["newArrayBytes"] = 12 * corners;
row["newArrayMb"] = Math.round(((12 * corners) / 1048576) * 100) / 100;
row["peakMbAfterGraph"] = mb();
save();
if (process.env["MEM_ROUTE"] !== "0") {
  const routes = routerNamed(router).route(board).routes.length;
  row["routes"] = routes;
  row["peakMbAfterRoute"] = mb();
  save();
}
