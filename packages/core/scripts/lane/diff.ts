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

/**
 * This function gives a copy of a strategy with the name `<name>-lane`, because the screen refuses a new strategy with a built-in name.
 * A run of the copy starts a record. The lane orders count for the record that started last, also in the routes of the other steps.
 * A second run of a record does not count.
 */
function wrap<T extends { name: string; run: (input: never, options?: never) => unknown }>(s: T): T {
  return {
    ...s,
    name: `${s.name}-lane`,
    run(input: never, options?: never) {
      const board = boardOf(input as object);
      const record = `${s.name}|${board}`;
      current = records.has(record) ? undefined : { record, board };
      records.add(record);
      boards.add(board);
      return s.run(input, options);
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
