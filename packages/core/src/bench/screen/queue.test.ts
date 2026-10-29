import { describe, expect, it } from "vitest";
import { loadIdeas, type Idea } from "../../../scripts/ideas.ts";
import { builders, strategyIdeas } from "../../../scripts/strategy-ideas.ts";
import { STEPS, STRATEGIES, listStrategies } from "../../strategies/index.ts";
import { bootstrap, buildQueue, committedQueue, ENABLERS, gainOf, loadSnapshots, loadTaken, measuredGain, OPEN_STAGES, openTargets, queueText, readQueue, spearman, unblocked, type QueueSnapshot } from "../../../scripts/queue.ts";

const ideas = loadIdeas();
const old = committedQueue();
const queue = readQueue(old?.queue.date ?? "", old?.queue.commit ?? "");

describe("the idea queue (IDEA-QUEUE)", () => {
  it("is current: the committed queue.json equals the output of the script", () => {
    expect(old !== undefined, "queue.json does not exist. Run `pnpm queue`.").toBe(true);
    expect(old?.text === queueText(queue), "queue.json is old. Run `pnpm queue`.").toBe(true);
  });

  it("has exactly one row for each idea at the stage cataloged or prototyped", () => {
    const open = ideas.filter((r) => OPEN_STAGES.includes(r.stage)).map((r) => r.id).sort();
    const stage = new Map(ideas.map((r) => [r.id, r.stage]));
    const rows = queue.rows.filter((r) => OPEN_STAGES.includes(stage.get(r.id) ?? "")).map((r) => r.id).sort();
    expect(rows).toEqual(open);
    expect(new Set(queue.rows.map((r) => r.id)).size).toBe(queue.rows.length);
  });

  it("gives a rank only to the enablers and the canonical rows that are not built, from 1 with no gap", () => {
    for (const r of queue.rows) {
      if (r.canonical !== r.id || r.status === "built") expect(r.rank, r.id).toBeNull();
      else expect(r.rank, r.id).not.toBeNull();
    }
    const joint = [...queue.enablers, ...queue.rows.flatMap((r) => (r.rank === null ? [] : [{ id: r.id, rank: r.rank, score: r.score }]))].sort((a, b) => a.rank - b.rank);
    expect(joint.map((r) => r.rank)).toEqual(joint.map((_, i) => i + 1));
    const scores = joint.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
  });

  it("gives each enabler the sum of the scores that it unblocks, divided by its cost", () => {
    expect(queue.enablers.map((e) => e.id).sort()).toEqual(ENABLERS.map((e) => e.id).sort());
    const score = new Map(queue.rows.map((r) => [r.id, r.score]));
    for (const e of queue.enablers) {
      expect(e.unblocks.length, e.id).toBeGreaterThan(0);
      const sum = e.unblocks.reduce((t, id) => t + score.get(id)!, 0);
      expect(e.sum, e.id).toBeCloseTo(sum, 2);
      expect(e.score, e.id).toBeCloseTo(e.sum / e.cost, 2);
      // An unblocked idea is ranked, and each of its blocks is a block of the enabler or an idea that the enabler unblocks.
      for (const id of e.unblocks) {
        const row = queue.rows.find((r) => r.id === id)!;
        expect(row.rank, id).not.toBeNull();
        expect(row.blockedBy.length, id).toBeGreaterThan(0);
      }
    }
  });

  it("unblocks a chain of ideas, and leaves an idea with the blocks of two enablers to both", () => {
    const slots = { id: "SLOTS", name: "slots", removes: ["step:"], size: "L" };
    const measures = { id: "MEASURES", name: "measures", removes: ["measure:"], size: "L" };
    const rows = [
      { id: "A", blockedBy: ["step:whole"], status: "queued" as const },
      { id: "B", blockedBy: ["idea:A"], status: "queued" as const },
      { id: "C", blockedBy: ["step:whole", "measure:Z9"], status: "queued" as const },
      { id: "D", blockedBy: ["idea:E"], status: "queued" as const },
      { id: "E", blockedBy: [], status: "queued" as const },
    ];
    expect(unblocked(slots, rows)).toEqual(["A", "B"]);
    expect(unblocked(measures, rows)).toEqual([]);
  });

  it("gives the back test with a bootstrap interval that holds the rank correlation", () => {
    const b = queue.backtest;
    expect(b.ideas).toBeGreaterThanOrEqual(50);
    expect(b.low).toBeLessThanOrEqual(b.rho);
    expect(b.high).toBeGreaterThanOrEqual(b.rho);
    const same = [1, 2, 3, 4, 5, 6].map((x) => ({ id: String(x), strategy: "s", predicted: x, measured: 2 * x }));
    expect(bootstrap(same, 100, 1)).toMatchObject({ rho: 1, high: 1 });
  });

  it("keeps the frozen numbers of each taken idea, and a measured gain for each built row", () => {
    const taken = loadTaken();
    for (const t of taken) {
      const row = queue.rows.find((r) => r.id === t.id);
      expect(row, t.id).toBeDefined();
      expect(row?.takenAt).toBe(t.takenAt);
      expect(row?.predicted).toEqual(t.predicted);
    }
    for (const r of queue.rows.filter((x) => x.status === "built")) {
      expect(r.strategy, `${r.id} is built but has no strategy`).toBeDefined();
      if (taken.some((t) => t.id === r.canonical)) {
        expect(r.predicted, `${r.id} is built but has no predicted gain`).toBeDefined();
        expect(r.measured, `${r.id} is built but has no measured gain. Set its strategy with \`pnpm queue --take ${r.id} --by <item> --strategy <name>\`.`).toBeDefined();
      }
    }
  });

  it("never ranks an idea that a registered strategy builds", () => {
    const built = builders(strategyIdeas());
    expect(built.get("HWY-031")).toBe("corridors");
    for (const r of queue.rows.filter((x) => built.has(x.canonical))) {
      expect(r.rank, r.id).toBeNull();
      expect(r.status, r.id).toBe("built");
      expect(r.strategy, r.id).toBe(built.get(r.canonical));
    }
  });

  it("maps only registered strategies to ideas that exist", () => {
    const map = strategyIdeas();
    const names = STEPS.flatMap((step) => listStrategies(STRATEGIES, step).map((s) => `${step}:${s.name}`));
    expect(map.map((m) => `${m.step}:${m.strategy}`).sort()).toEqual([...names].sort());
    const ids = new Set(ideas.map((r) => r.id));
    for (const m of map) for (const id of m.ideas) expect(ids.has(id), `${m.strategy} names ${id}, which does not exist`).toBe(true);
  });

  it("counts the open targets as the better verdicts of the newest set with families against them", () => {
    const targets = openTargets(loadSnapshots().map((s) => s.snapshot));
    expect(targets.length).toBe(queue.counts["openTargets"]);
    expect(targets.every((t) => t.against.length >= 1)).toBe(true);
  });

  it("gives the gain, the measured gain and the blocks of the formula", () => {
    const snap: QueueSnapshot = {
      set: "s",
      step: "highway",
      run: 1,
      rows: [
        { strategy: "a", guard: "B1", label: "better", families: [{ family: "x", sign: 1 }, { family: "y", sign: -1 }], breadth: { against: 1 } },
        { strategy: "b", guard: "B1", label: "better", families: [{ family: "x", sign: 1 }, { family: "y", sign: 1 }], breadth: { against: 0 } },
        { strategy: "b", guard: "B3 q0.95", label: "worse", families: [{ family: "x", sign: -1 }, { family: "y", sign: -1 }], breadth: { against: 0 } },
      ],
    };
    const targets = openTargets([snap]);
    expect(gainOf(["B1", "B3"], targets)).toBe(3);
    // The strategy b is better on B1 (0.5) and closes the target of a on B1 (1). It is not better on B3.
    expect(measuredGain("b", ["B1", "B3"], [snap])).toBe(2.5);
    expect(measuredGain("c", ["B1"], [snap])).toBeUndefined();
    // An opt-in strategy gets its rows from the opt-in snapshots of the newest set. Its targets do not count.
    const optIn: QueueSnapshot = { ...snap, rows: [{ ...snap.rows[1]!, strategy: "c" }, { ...snap.rows[0]!, strategy: "d" }] };
    expect(measuredGain("c", ["B1"], [snap], [optIn])).toBe(2.5);
    expect(measuredGain("c", ["B1"], [snap], [{ ...optIn, set: "r" }])).toBeUndefined();
    const base = Object.fromEntries(Object.entries(ideas.find((r) => r.id === "HWY-001")!).filter(([k]) => !["same", "canonical", "dependsOn", "result"].includes(k))) as Idea;
    const q = buildQueue({
      ideas: [
        { ...base, id: "HWY-901", step: "levels", stage: "cataloged", wins: ["B1", "G5"], screen: "B1 falls", prototype: "S", kind: "ours", cost: "fast", related: [], dependsOn: ["HWY-902"] },
        { ...base, id: "HWY-902", step: "highway", stage: "cataloged", wins: ["B1"], screen: "B1 falls", prototype: "M", kind: "literature", cost: "CI only", related: ["HWY-903"] },
        { ...base, id: "HWY-903", step: "highway", stage: "screened", wins: ["B1"], screen: "B1 falls", prototype: "S", kind: "ours", cost: "fast", related: ["HWY-902"], result: { records: ["r"], measures: {}, date: "2026-10-28" } },
      ],
      snapshots: [snap],
      taken: [],
      strategies: [],
      measures: new Set(["B1"]),
      steps: ["highway"],
      enablers: [],
      date: "d",
      commit: "c",
      inputs: [],
    });
    const [first, second] = q.rows;
    // HWY-901: gain 1 + (0.5 + 1) + 0.5 = 3, uncertainty 1 x 1.2 (no near idea has a result), cost 1 x 2 (no slot).
    expect(first).toMatchObject({ id: "HWY-901", gain: 3, uncertainty: 1.2, cost: 2, score: 1.8, rank: 1, slot: false, blockedBy: ["step:levels", "measure:G5", "idea:HWY-902"], status: "queued" });
    // HWY-902: gain 2.5, uncertainty 0.7 (its near idea HWY-903 has a result), cost 2 x 2 (CI only).
    expect(second).toMatchObject({ id: "HWY-902", gain: 2.5, uncertainty: 0.7, cost: 4, score: 0.438, rank: 2, blockedBy: [] });
    expect(q.rows.some((r) => r.id === "HWY-903")).toBe(false);
  });

  it("gives the rank correlation", () => {
    expect(spearman([1, 2, 3, 4, 5], [2, 4, 6, 8, 10])).toBe(1);
    expect(spearman([1, 2, 3, 4, 5], [5, 4, 3, 2, 1])).toBe(-1);
  });
});
