import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { absoluteLinks, ageText, compareReads, coverageView, keptRows, keylessTies, linkHtml, parseSnapshot, QUEUE_TOP, rangeText, readCore, queueView, recordAge, shippedRows, SHIPPED_COUNT, splitVerdicts, stageCounts, stampSnapshots } from "./results-data.ts";
import type { VerdictTable } from "./results-data.ts";
import { buildInfo, dataLineHtml, ideaRecords, readResults, snapshotFiles } from "./results-files.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));

/** This function gives the last count of split verdicts that CATALOG.md states for a set. The newest wave comes last. */
function splitCount(set: string): RegExpMatchArray | undefined {
  const catalog = readFileSync(join(root, "docs/research/CATALOG.md"), "utf8");
  const re = new RegExp(`Over all the \`better\` verdicts of \`${set}\`, (\\d+) of (\\d+) have 1 or more families against them`, "g");
  return [...catalog.matchAll(re)].at(-1);
}

const roadmap = ["# R", "", "## Shipped", "", "| Id | Item | Shipped | Link |", "|---|---|---|---|", "| A1 | The `x` router. | 2026-10-01 | `abcdef1` |", "| B2 | [The opt-in router](research/A.md#b) `y`. | 2026-10-02 | #12 |", "| REL1 | Version 1, opt-in. | 2026-10-03 | #13 |", "", "## Calibration", "| C | d | e | f |"].join("\n");

describe("results data", () => {
  it("reads the Shipped rows of a roadmap", () => {
    const rows = shippedRows(roadmap);
    expect(rows.map((r) => r.id)).toEqual(["A1", "B2", "REL1"]);
    expect(linkHtml(rows[0]!.link)).toContain("/commit/abcdef1");
    expect(linkHtml(rows[1]!.link)).toContain("/pull/12");
    expect(absoluteLinks(rows[1]!.item)).toContain("](https://github.com/mark1russell7/highways/blob/main/docs/research/A.md#b)");
  });

  it("takes the kept records and the opt-in rows that are not releases", () => {
    const kept = keptRows([{ id: "I-1", name: "One", step: "router", stage: "kept", result: { note: "The option `a: b` is off. More." } }, { id: "I-2", name: "Two", step: "router", stage: "dropped" }], shippedRows(roadmap));
    expect(kept.map((k) => [k.id, k.what, k.status, k.default])).toEqual([
      ["I-1", "a: b", "kept", "unchanged"],
      ["B2", "y", "opt-in", "unchanged"],
    ]);
    expect(kept[0]!.note).toBe("The option `a: b` is off.");
  });

  it("refuses a snapshot without its header", () => {
    expect(() => parseSnapshot(JSON.stringify({ set: "s", step: "router", rows: [] }))).toThrow(/base/);
  });

  const HEAD = { set: "s", step: "router", base: "shared", level: 0.05, run: 1, commit: "c", date: "2026-11-05", core: "0.9.2" };
  const ROW = { strategy: "a", guard: "R1", measure: "route.crossings", label: "worse", old: "worse", stratified: -2, pooled: -3, p: 0.01, families: [{ family: "f", n: 3, mean: -2, sign: -1 }], breadth: { against: 0, of: 1, ties: 0 } };

  it("reads the stamp of a later read, and refuses a stamp without its fields", () => {
    const stamp = { core: "0.15.0", run: 2, commit: "d", date: "2026-11-06" };
    const s = parseSnapshot(JSON.stringify({ ...HEAD, verified: stamp, rows: [] }));
    expect([readCore(s), readCore({ core: "0.9.2" })]).toEqual(["0.15.0", "0.9.2"]);
    expect(() => parseSnapshot(JSON.stringify({ ...HEAD, verified: { core: "0.15.0" }, rows: [] }))).toThrow(/"run" in its field "verified"/);
  });

  it("verifies a read with the same rows, and gives each row that differs with its fields", () => {
    const snap = parseSnapshot(JSON.stringify({ ...HEAD, rows: [ROW, { ...ROW, strategy: "b" }] }));
    const same = parseSnapshot(JSON.stringify({ ...HEAD, core: "0.15.0", run: 2, rows: [{ ...ROW, strategy: "b", through: 4 }, { ...ROW }] }));
    expect(compareReads(snap, same)).toEqual([]);
    const moved = parseSnapshot(JSON.stringify({ ...HEAD, rows: [{ ...ROW, label: "no verdict", p: 0.2 }, { ...ROW, strategy: "c" }] }));
    expect(compareReads(snap, moved)).toEqual([
      { key: "a R1 route.crossings", fields: ["label", "p"] },
      { key: "b R1 route.crossings", fields: ["row"] },
      { key: "c R1 route.crossings", fields: ["row"] },
    ]);
    expect(() => compareReads(snap, { ...same, step: "plugs" })).toThrow(/step plugs/);
  });

  it("stamps a snapshot with the same rows, and leaves a snapshot that differs or has no read (STAMP-ON-RELEASE)", () => {
    // The text of a committed snapshot: one field on each line of the header, as the files of the repository.
    const file = (set: string, rows: unknown[], verified?: object): string =>
      [
        "{",
        ...Object.entries({ ...HEAD, set }).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`),
        ...(verified === undefined ? [] : [`  "verified": ${JSON.stringify(verified)},`]),
        `  "rows": ${JSON.stringify(rows)}`,
        "}",
        "",
      ].join("\n");
    const files = [
      { name: "equal.json", text: file("equal", [ROW], { core: "0.14.0", run: 3, commit: "e", date: "2026-11-01" }) },
      { name: "moved.json", text: file("moved", [ROW]) },
      { name: "unread.json", text: file("unread", [ROW]) },
    ];
    const read = (set: string, rows: unknown[]) => parseSnapshot(JSON.stringify({ ...HEAD, set, core: "0.16.0", run: 9, commit: "f", date: "2026-11-08", rows }));
    const out = stampSnapshots(files, [read("equal", [ROW]), read("moved", [{ ...ROW, label: "better" }])]);
    expect(out.map((o) => [o.name, o.status])).toEqual([
      ["equal.json", "stamped"],
      ["moved.json", "differ"],
      ["unread.json", "unread"],
    ]);
    const stamped = out[0]!.status === "stamped" ? out[0]!.text : "";
    // The new stamp replaces the old one, and the rows keep their bytes.
    expect(parseSnapshot(stamped).verified).toEqual({ core: "0.16.0", run: 9, commit: "f", date: "2026-11-08" });
    expect(stamped.match(/"verified"/g)).toHaveLength(1);
    expect(stamped.split("\n").at(-2)).toBe(files[0]!.text.split("\n").at(-2));
    expect(out[1]).toMatchObject({ status: "differ", diffs: [{ key: "a R1 route.crossings", fields: ["label"] }] });
  });

  it("counts the stages in the sequence of the page", () => {
    expect(stageCounts([{ stage: "cataloged" }, { stage: "kept" }, { stage: "cataloged" }] as never)).toEqual([
      { stage: "kept", count: 1 },
      { stage: "cataloged", count: 2 },
    ]);
  });
});

describe("the age of a record", () => {
  it("counts the days to today, and compares the core with the core of the site", () => {
    expect(recordAge("2026-11-02", "0.10.0", "0.14.0", "2026-11-04")).toEqual({ days: 2, sameCore: false });
    expect(recordAge("2026-11-04", "0.14.0", "0.14.0", "2026-11-04")).toEqual({ days: 0, sameCore: true });
  });

  it("does not give a negative age for a date after the date of the viewer", () => {
    expect(recordAge("2026-11-05", "0.14.0", "0.14.0", "2026-11-04").days).toBe(0);
  });

  it("gives the age as text", () => {
    expect([0, 1, 2].map(ageText)).toEqual(["from today", "1 day old", "2 days old"]);
  });
});

describe("the view of the coverage", () => {
  it("keeps the counts of the record and the points of the trend", () => {
    const record = JSON.stringify({ schema: "x", measures: 2, strategies: 3, options: 4, inputs: 5, cells: 24, fitted: 6, value: 0.25, fits: [] });
    const point = { date: "2026-11-04", core: "0.14.0", cells: 24, fitted: 6, value: 0.25 };
    expect(coverageView(record, JSON.stringify([point]))).toEqual({ measures: 2, strategies: 3, options: 4, inputs: 5, cells: 24, fitted: 6, value: 0.25, trend: [point] });
  });
});

describe("the marks of the families with no key", () => {
  const table: VerdictTable = {
    set: "s",
    step: "router",
    base: "shared",
    level: 0.05,
    run: 1,
    commit: "c",
    date: "2026-11-05",
    core: "0.1.0",
    families: ["keyed-a", "plain-b", "plain-c", "plain-d"],
    guards: [{ id: "R1", measure: "route.crossings" }],
    strategies: [
      { name: "corners", cells: [{ guard: "R1", label: "worse", against: 1, of: 4, ties: 1, signs: "-+-0", p: 0.01 }] },
      { name: "other", cells: [{ guard: "R1", label: "worse", against: 1, of: 4, ties: 1, signs: "-+-0", p: 0.01 }] },
    ],
  };

  it("changes each mark of the row `corners` with no key to a tie, and it keeps the label", () => {
    const [corners, other] = keylessTies(table, ["keyed-a"]).strategies;
    expect(corners!.cells[0]).toEqual({ guard: "R1", label: "worse", against: 0, of: 4, ties: 3, signs: "-000", p: 0.01, tiedByCause: 2 });
    expect(other).toEqual(table.strategies[1]);
  });

  it("states the families with no key, and it leaves a table with another base as it is", () => {
    expect(keylessTies(table, ["keyed-a"]).keyless).toEqual(["plain-b", "plain-c", "plain-d"]);
    const other = { ...table, base: "pipeline" };
    expect(keylessTies(other, ["keyed-a"])).toBe(other);
  });
});

describe("the committed files of the results page", () => {
  it("reads the row `corners` of `screen-v3` with a tie by cause on the 12 families with no key", () => {
    const t = readResults(root).tables.find((x) => x.set === "screen-v3" && x.step === "router")!;
    expect(t.keyless).toHaveLength(12);
    const r1 = t.strategies.find((s) => s.name === "corners")!.cells.find((c) => c.guard === "R1")!;
    expect(r1).toMatchObject({ label: "worse", against: 0, of: 15, ties: 12, tiedByCause: 4 });
  });

  it("states on the page the counts of the list of the moved labels, and the list holds the labels of the snapshots", () => {
    const list = JSON.parse(readFileSync(join(root, "docs/research/key-split/moved.json"), "utf8")) as {
      schema: string;
      labels: number;
      moved: number;
      rows: { step: string; strategy: string; guard: string; shared: string; corners: string }[];
    };
    const flips = list.rows.filter((r) => [r.shared, r.corners].sort().join() === "better,worse").length;
    expect([list.schema, list.labels, list.moved, list.rows.length, flips]).toEqual(["key-split-moved/1", 299, 92, 92, 33]);
    const text = readFileSync(join(root, "packages/site/content/results.md"), "utf8");
    expect(text).toContain(`${list.moved} of ${list.labels} labels of \`screen-v3\` move, and ${flips} of them`);
    expect(text).toContain("blob/main/docs/research/key-split/moved.json");
    const { tables } = readResults(root);
    for (const r of list.rows) {
      const cell = tables.find((t) => t.set === "screen-v3" && t.step === r.step)!.strategies.find((s) => s.name === r.strategy)!.cells.find((c) => c.guard === r.guard)!;
      expect(cell.label, `${r.strategy} ${r.guard}`).toBe(r.shared);
    }
  });

  it("has the run, the date and the core of each verdict snapshot", () => {
    const { tables, core } = readResults(root);
    expect(tables.length).toBeGreaterThanOrEqual(15);
    expect(core).toMatch(/^\d+\.\d+\.\d+/);
    for (const t of tables) {
      expect(t.run, `${t.set} ${t.step}`).toBeGreaterThan(0);
      expect(t.date, `${t.set} ${t.step}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(t.core, `${t.set} ${t.step}`).toMatch(/^\d+\.\d+\.\d+/);
    }
  });

  it("shows the value of the coverage with its denominator and its weekly points", () => {
    const { coverage } = readResults(root);
    expect(coverage!.cells).toBe(coverage!.measures * (coverage!.strategies + coverage!.options + coverage!.inputs));
    expect(coverage!.value).toBe(coverage!.fitted / coverage!.cells);
    expect(coverage!.trend.at(-1)!.cells).toBe(coverage!.cells);
  });

  const files = snapshotFiles(root);

  it("has a snapshot with a full header for each set and step", () => {
    const names = files.map((f) => f.name);
    for (const n of ["screen-v1-router.json", "screen-v1-highway.json", "screen-v2-router.json", "screen-v2-highway.json"]) expect(names).toContain(n);
    for (const f of files) {
      const s = parseSnapshot(f.text, f.name);
      expect(f.name, f.name).toBe(`${s.set}-${s.step}.json`);
      expect(s.run, f.name).toBeGreaterThan(0);
      expect(s.commit, f.name).toMatch(/^[0-9a-f]{40}$/);
      expect(s.date, f.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(s.core, f.name).toMatch(/^\d+\.\d+\.\d+/);
      expect(s.rows.length, f.name).toBeGreaterThan(0);
    }
  });

  it("gives the same count of split verdicts on screen-v2 as CATALOG.md", () => {
    const m = splitCount("screen-v2");
    expect(m).toBeDefined();
    const v2 = files.map((f) => parseSnapshot(f.text, f.name)).filter((s) => s.set === "screen-v2");
    const split = v2.flatMap(splitVerdicts);
    expect(split.length).toBe(Number(m![1]));
    expect(v2.reduce((n, s) => n + s.rows.filter((r) => r.label === "better").length, 0)).toBe(Number(m![2]));
    for (const v of split) expect(v.against.length).toBeGreaterThan(0);
  });

  it("builds the page data from the committed files", () => {
    const data = readResults(root);
    expect(data.tables).toHaveLength(files.length);
    expect(data.splitSet).toBe("screen-v3");
    const m = splitCount("screen-v3");
    expect(data.split.length).toBe(Number(m?.[1]));
    expect(data.betterCount).toBe(Number(m?.[2]));
    expect(data.ideas.total).toBe(ideaRecords(root).length);
    expect(data.ideas.stages.reduce((n, s) => n + s.count, 0)).toBe(data.ideas.total);
    expect(data.ideas.kept.length).toBeGreaterThan(0);
    expect(data.shipped).toHaveLength(SHIPPED_COUNT);
    expect(data.text["The verdicts"]).toContain("<p>");
    for (const t of data.tables) for (const s of t.strategies) expect(s.cells.length, `${t.set} ${s.name}`).toBe(t.guards.length);
  });

  it("gives the measures of the core with the definition of each new measure (SCREEN-MEASURES)", () => {
    const data = readResults(root);
    expect(data.measures.length).toBeGreaterThan(100);
    expect(data.text["The measures"]).toContain("<p>");
    for (const id of ["C4", "C8", "G4", "G5", "G7", "H3", "M2", "M3", "M5", "Z1", "Z5"]) {
      const rows = data.measures.filter((m) => m.id === id && m.definition !== "");
      expect(rows.length, id).toBeGreaterThan(0);
    }
  });

  it("writes the range of each measure as text (MEASURE-RANGES)", () => {
    expect([rangeText(0, 1), rangeText(1, Infinity), rangeText(-Infinity, 0), rangeText(-Infinity, Infinity), rangeText(-0.5, 1)]).toEqual(["0 to 1", "1 or more", "0 or less", "any value", "-0.5 to 1"]);
    const rows = readResults(root).measures;
    expect(rows.every((m) => m.range !== "")).toBe(true);
    expect(rows.find((m) => m.name === "route.crossings")?.range).toBe("0 or more");
  });

  it("shows the top of the idea queue and the count of each status", () => {
    const data = readResults(root);
    expect(data.queue.top).toHaveLength(QUEUE_TOP);
    expect(data.queue.top.map((r) => r.rank)).toEqual(Array.from({ length: QUEUE_TOP }, (_, i) => i + 1));
    expect(data.queue.statuses.map((s) => s.status)).toEqual(["queued", "building", "built"]);
    expect(data.queue.statuses.filter((s) => s.status !== "built").reduce((n, s) => n + s.count, 0)).toBe(data.queue.ranked);
    expect(data.text["The build queue"]).toContain("<p>");
    expect(() => queueView("{}")).toThrow(/queue.json/);
    for (const e of data.queue.enablers) {
      expect(e.kind, e.id).toBe("enabler");
      expect(e.unblocks, e.id).toBeGreaterThan(0);
      // An enabler in the top ranks is on the joint list of the top rows.
      if (e.rank <= QUEUE_TOP) expect(data.queue.top.some((r) => r.id === e.id), e.id).toBe(true);
    }
    const b = data.queue.backtest;
    expect(b.low <= b.rho && b.rho <= b.high).toBe(true);
  });

  it("gives the data line of the build", () => {
    const info = buildInfo(root, { GITHUB_SHA: "0123456789abcdef0123456789abcdef01234567" });
    expect(info.core).toMatch(/^\d+\.\d+\.\d+/);
    expect(dataLineHtml(info)).toContain("<code>0123456</code>");
  });

  it("has a benchmark snapshot with its run", () => {
    const rows = JSON.parse(readFileSync(join(root, "docs/research/bench/bench.json"), "utf8")) as unknown[];
    const meta = JSON.parse(readFileSync(join(root, "docs/research/bench/bench-meta.json"), "utf8")) as { run: number; sha: string; date: string };
    expect(rows.length).toBeGreaterThan(0);
    expect(meta.run).toBeGreaterThan(0);
    expect(meta.sha).toMatch(/^[0-9a-f]{40}$/);
  });
});
