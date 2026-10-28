// MEASURE-ONLY (LANE-ORDER): `pnpm screen --module packages/core/scripts/lane/diff.ts` screens the built-in strategies of the step.
// For each run of 2 or more lanes, it compares the merge sort of the package with the sort of this engine, by the count of lanes.
// At the exit, the script writes the counts, and the records and the inputs with at least one changed run.
import { createHash } from "node:crypto";
import { hasCycle, observeLanes } from "../../src/lane-order.ts";
import { highwayStrategies, routerStrategies } from "../../src/strategies/builtins.ts";

const sizes: Record<string, { runs: number; cyclic: number; changed: number }> = {};
const records = new Set<string>();
const changedRecords = new Set<string>();
const boards = new Set<string>();
const changedBoards = new Set<string>();
const ids = new WeakMap<object, string>();
let current: { record: string; board: string } | undefined;

observeLanes((start, compare, order) => {
  if (start.length < 2 || current === undefined) return;
  const size = String(Math.min(start.length, 8));
  const s = (sizes[size] ??= { runs: 0, cyclic: 0, changed: 0 });
  s.runs++;
  if (hasCycle(start.length, (i, j) => compare(start[i]!, start[j]!))) s.cyclic++;
  const engine = [...start].sort(compare);
  if (engine.some((x, i) => x !== order[i])) {
    s.changed++;
    changedRecords.add(current.record);
    changedBoards.add(current.board);
  }
});

function boardOf(input: object): string {
  let id = ids.get(input);
  if (id === undefined) {
    id = createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 16);
    ids.set(input, id);
  }
  return id;
}

function wrap<T extends { name: string; run: (input: never, options?: never) => unknown }>(s: T): T {
  return {
    ...s,
    run(input: never, options?: never) {
      const board = boardOf(input as object);
      const record = `${s.name}|${board}`;
      // Only the first run of a record counts, so a repeated run does not count again.
      const outer = current;
      current = records.has(record) && outer === undefined ? undefined : { record, board };
      records.add(record);
      boards.add(board);
      try {
        return s.run(input, options);
      } finally {
        current = outer;
      }
    },
  };
}

process.on("exit", () =>
  console.log(
    `lane-order diff: ${JSON.stringify({ node: process.version, v8: process.versions.v8, sizes, records: records.size, changedRecords: changedRecords.size, boards: boards.size, changedBoards: changedBoards.size })}`,
  ),
);

export const routers = Object.values(routerStrategies).map(wrap);
export const highways = Object.values(highwayStrategies).map(wrap);
