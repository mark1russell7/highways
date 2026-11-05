import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { makeFixture, FIXTURES } from "../src/fixtures.ts";
import { ambiguityRecord, boardRows, BOARDS, keyedBoard, KEYS, READ, REAL, SCHEMA, SLICE, summaries, type AmbiguityRow } from "./ambiguity-read-rows.ts";

const saved = JSON.parse(readFileSync(new URL("./data/ambiguity-read/record.json", import.meta.url), "utf8")) as ReturnType<typeof ambiguityRecord>;
const board = makeFixture(FIXTURES.find((f) => f.name === "tiny-uniform")!);
const keysOf = (arm: Parameters<typeof keyedBoard>[1]): unknown[] => keyedBoard(board, arm).edges.map((e) => e.data?.["collection"]);
const row = (router: string, share: number, reach: number): AmbiguityRow => ({
  board: "b",
  nodes: 10,
  edges: 15,
  key: "none",
  router,
  share,
  nearPerNode: 4,
  falsePerNode: 3,
  reach,
  estimated: false,
});

describe("the record ambiguity-read/1", () => {
  it("names its version and holds each board and router", () => {
    expect(saved.schema).toBe(SCHEMA);
    for (const name of BOARDS) for (const router of READ) expect(saved.rows.some((r) => r.board === name && r.router === router)).toBe(true);
  });

  it("holds fresh values for its small part", () => {
    expect(saved.slice, `The record is stale. Write it again with: ${saved.regenerate}`).toEqual(boardRows(SLICE.board, SLICE.key));
  });

  it("reads 0 for straight lines, because they share no segment", () => {
    for (const r of saved.rows.filter((x) => x.router === "straight")) expect(r.share).toBe(0);
  });
});

describe("keyedBoard", () => {
  it("removes the key in the arm none", () => {
    expect(keysOf("none").every((k) => k === undefined)).toBe(true);
    expect(keyedBoard(board, "none").edges.every((e) => e.data === undefined || !("collection" in e.data))).toBe(true);
  });

  it("keeps the fixture in the arm random", () => {
    expect(keyedBoard(board, "random")).toBe(board);
  });

  it("gives one name to the edges with one target in the arm cluster", () => {
    const names = new Map<string, unknown>();
    for (const e of keyedBoard(board, "cluster").edges) {
      const name = e.data?.["collection"];
      expect(name).toEqual(expect.stringMatching(/^cell-\d+-\d+$/));
      if (names.has(e.target.node)) expect(names.get(e.target.node)).toBe(name);
      names.set(e.target.node, name);
    }
  });

  it("states three values of the key", () => {
    expect(KEYS).toEqual(["none", "random", "cluster"]);
  });
});

describe("summaries", () => {
  it("reads the range over the real routers only", () => {
    const rows = [...REAL.map((router, i) => row(router, 0.9 + i * 0.01, 0.1 + i * 0.1)), row("one-trunk", 1, 0.99), row("straight", 0, 0)];
    const [summary] = summaries(rows);
    expect(summary!.shareLow).toBeCloseTo(0.9);
    expect(summary!.shareHigh).toBeCloseTo(0.94);
    expect(summary!.flat).toBe(true);
    expect(summary!.reachLow).toBeCloseTo(0.1);
    expect(summary!.reachHigh).toBeCloseTo(0.5);
  });

  it("does not call a wide range flat", () => {
    const rows = REAL.map((router, i) => row(router, i * 0.1, 0.1));
    expect(summaries(rows)[0]!.flat).toBe(false);
  });
});
