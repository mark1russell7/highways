import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { absoluteLinks, keptRows, linkHtml, parseSnapshot, QUEUE_TOP, queueView, shippedRows, SHIPPED_COUNT, splitVerdicts, stageCounts } from "./results-data.ts";
import { buildInfo, dataLineHtml, ideaRecords, readResults, snapshotFiles } from "./results-files.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));

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

  it("counts the stages in the sequence of the page", () => {
    expect(stageCounts([{ stage: "cataloged" }, { stage: "kept" }, { stage: "cataloged" }] as never)).toEqual([
      { stage: "kept", count: 1 },
      { stage: "cataloged", count: 2 },
    ]);
  });
});

describe("the committed files of the results page", () => {
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
    const catalog = readFileSync(join(root, "docs/research/CATALOG.md"), "utf8");
    const m = /Over all the `better` verdicts of `screen-v2`, (\d+) of (\d+) have 1 or more families against them/.exec(catalog);
    expect(m).not.toBeNull();
    const v2 = files.map((f) => parseSnapshot(f.text, f.name)).filter((s) => s.set === "screen-v2");
    const split = v2.flatMap(splitVerdicts);
    expect(split.length).toBe(Number(m![1]));
    expect(v2.reduce((n, s) => n + s.rows.filter((r) => r.label === "better").length, 0)).toBe(Number(m![2]));
    for (const v of split) expect(v.against.length).toBeGreaterThan(0);
  });

  it("builds the page data from the committed files", () => {
    const data = readResults(root);
    expect(data.tables).toHaveLength(files.length);
    expect(data.splitSet).toBe("screen-v2");
    expect(data.split.length).toBe(40);
    expect(data.ideas.total).toBe(ideaRecords(root).length);
    expect(data.ideas.stages.reduce((n, s) => n + s.count, 0)).toBe(data.ideas.total);
    expect(data.ideas.kept.length).toBeGreaterThan(0);
    expect(data.shipped).toHaveLength(SHIPPED_COUNT);
    expect(data.text["The verdicts"]).toContain("<p>");
    for (const t of data.tables) for (const s of t.strategies) expect(s.cells.length, `${t.set} ${s.name}`).toBe(t.guards.length);
  });

  it("shows the top of the idea queue and the count of each status", () => {
    const data = readResults(root);
    expect(data.queue.top).toHaveLength(QUEUE_TOP);
    expect(data.queue.top.map((r) => r.rank)).toEqual(Array.from({ length: QUEUE_TOP }, (_, i) => i + 1));
    expect(data.queue.statuses.map((s) => s.status)).toEqual(["queued", "building", "built"]);
    expect(data.queue.statuses.filter((s) => s.status !== "built").reduce((n, s) => n + s.count, 0)).toBe(data.queue.ranked);
    expect(data.text["The build queue"]).toContain("<p>");
    expect(() => queueView("{}")).toThrow(/queue.json/);
    expect(data.queue.enablers.length).toBeGreaterThanOrEqual(1);
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
