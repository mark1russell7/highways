/**
 * This script writes the record `session-time/1`: the time of a few edges among many nodes, with the plain route and with a session.
 *
 * - Each board is the fixture `uniform` of one size, with 4 edges for each node and the seed 1. The sizes are 400, 800 and 2000 nodes.
 * - Each run routes 2 edges of the board with the router `corners`. Run `n` of each arm on a board routes the same 2 edges, and each run routes other edges.
 * - The arm `plain` is `router.route({ ...graph, edges })`. The arm `session` is `session.route(edges)` on a session from before the timing.
 * - The arms run in one process, in turn on each board, with the order reversed in odd rounds (`measureIsolated`, MEASURE-ISOLATE).
 * - The A/A arm is a second arm `plain` with its own count of runs, so that it routes the edges of the arm `plain` in each round.
 *
 * The record also has the time to make one session, and it compares the bytes of the results of the two arms on 8 sets of edges.
 * This run only reports: it is not a gate. A time on a shared machine is not a result, so the workflow `Records` starts the script.
 *
 * The first argument is the out file. The variable `ROUNDS` sets the rounds, and its default is 15.
 * The variable `SIZES` is a list of node counts with commas, and its default is `400,800,2000`.
 */
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { mulberry32 } from "@mark1russell7/rigor-generators";
import { median } from "@mark1russell7/rigor-statistics";
import { makeFixture } from "../src/fixtures.ts";
import type { Edge, Graph, RouterSession } from "../src/model.ts";
import { cornersRouter } from "../src/routers/index.ts";
import { routerSession } from "../src/session.ts";
import { aaId, measureIsolated, pairedContext, pairedEnv, type Input } from "./gates/paired.ts";

const OUT = process.argv[2] ?? "out/session-time/record.json";
const ROUNDS = Number(process.env["ROUNDS"] ?? 15);
const SIZES = (process.env["SIZES"] ?? "400,800,2000").split(",").map(Number);
/** The number of edges of one run. */
const EDGES = 2;
/** The untimed runs before each timed run. */
const WARMUP = 2;
/** The number of timed sessions that give the time to make one session. */
const MAKES = 7;
/** The number of sets of edges that compare the bytes of the two arms. */
const CHECKS = 8;

/** One board of the run, with its sets of edges and its session. */
interface Board {
  readonly graph: Graph;
  /** The sets of edges, in the order of the runs. */
  readonly sets: readonly (readonly Edge[])[];
  readonly session: RouterSession;
  /** The number of the runs of each arm on this board. */
  readonly runs: Map<string, number>;
}

const corners = cornersRouter({ name: "corners" });

/** This function gives the sets of edges of a board: `count` sets of `EDGES` different edges, from a seed. */
function edgeSets(graph: Graph, count: number, seed: number): Edge[][] {
  const random = mulberry32(seed);
  return Array.from({ length: count }, () => {
    const picked = new Set<Edge>();
    while (picked.size < EDGES) picked.add(graph.edges[Math.floor(random() * graph.edges.length)]!);
    return [...picked];
  });
}

/** This function gives the next set of edges of an arm on a board. */
function next(board: Board, arm: string): readonly Edge[] {
  const n = board.runs.get(arm) ?? 0;
  board.runs.set(arm, n + 1);
  return board.sets[n % board.sets.length]!;
}

/** This function gives the median time in milliseconds to make one session, after one untimed session. */
function makeTime(graph: Graph): number {
  const times: number[] = [];
  for (let i = 0; i <= MAKES; i++) {
    const start = performance.now();
    routerSession(corners, graph).dispose();
    if (i > 0) times.push(performance.now() - start);
  }
  return median(times);
}

/** This function tells if the session and the plain route give the same bytes on the first sets of edges. */
function sameBytes(graph: Graph, sets: readonly (readonly Edge[])[]): boolean {
  const session = routerSession(corners, graph);
  const same = sets.slice(0, CHECKS).every((edges) => JSON.stringify(session.route(edges)) === JSON.stringify(corners.route({ ...graph, edges })));
  session.dispose();
  return same;
}

const inputs: Input<Board>[] = SIZES.map((nodes) => {
  const graph = makeFixture({ name: `uniform-${nodes}`, kind: "uniform", nodes, edgesPerNode: 4, seed: 1 });
  const sets = edgeSets(graph, ROUNDS * (WARMUP + 1), nodes);
  return { id: `uniform-${nodes}`, value: { graph, sets, session: routerSession(corners, graph), runs: new Map<string, number>() } };
});
const checks = inputs.map((input) => ({ make: makeTime(input.value!.graph), same: sameBytes(input.value!.graph, input.value!.sets) }));

const plain = (arm: string) => (board: Board) => corners.route({ ...board.graph, edges: next(board, arm) });
const report = measureIsolated({
  arms: [
    { id: "plain", run: plain("plain") },
    { id: "session", run: (board: Board) => board.session.route(next(board, "session")) },
    { id: aaId("plain"), run: plain(aaId("plain")) },
  ],
  inputs,
  repeats: ROUNDS,
  warmup: WARMUP,
  mode: "process",
  // The A/A arm is in the list of the arms, with its own count of runs.
  aa: false,
  env: pairedEnv(),
  context: pairedContext(),
});

const rows = inputs.map((input, i) => {
  const row = report.inputs.find((r) => r.id === input.id)!;
  const plainMs = row.median["plain"]!;
  const sessionMs = row.median["session"]!;
  return {
    id: input.id,
    nodes: input.value!.graph.nodes.length,
    graphEdges: input.value!.graph.edges.length,
    plainMs,
    sessionMs,
    /** The time of the plain route over the time of the session. */
    gain: plainMs / sessionMs,
    /** The ratio of the A/A arm: the second arm `plain` over the arm `plain`. */
    aa: row.ratio[aaId("plain")]!,
    makeMs: checks[i]!.make,
    sameBytes: checks[i]!.same,
  };
});
const record = { schema: "session-time/1", router: corners.name, edges: EDGES, rounds: ROUNDS, warmup: WARMUP, rows, report };
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(record, null, 2)}\n`);

const noise = report.noiseFloor ? `${report.noiseFloor.p10.toFixed(3)} to ${report.noiseFloor.p90.toFixed(3)}` : "none";
const lines = [
  `### Session time: ${EDGES} edges with the router \`corners\``,
  "",
  `CPU: ${report.env.cpu}. Node ${report.env.node}. Medians of ${ROUNDS} rounds, ${WARMUP} untimed runs before each timed run. A/A band of the arm \`plain\`: ${noise}.`,
  "",
  "| Nodes | plain ms | session ms | plain / session | A/A ratio | make a session ms | same bytes |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...rows.map((r) => `| ${r.nodes} | ${r.plainMs.toFixed(2)} | ${r.sessionMs.toFixed(3)} | ${r.gain.toFixed(1)} | ${r.aa.toFixed(3)} | ${r.makeMs.toFixed(2)} | ${r.sameBytes} |`),
];
console.log(lines.join("\n"));
const summary = process.env["GITHUB_STEP_SUMMARY"];
if (summary !== undefined && summary !== "") appendFileSync(summary, `${lines.join("\n")}\n\n`);
// A session that gives other bytes than the plain route is a fault of the code, not a time.
if (rows.some((r) => !r.sameBytes)) {
  console.error("session-time: a session gave other bytes than the plain route.");
  process.exitCode = 1;
}
