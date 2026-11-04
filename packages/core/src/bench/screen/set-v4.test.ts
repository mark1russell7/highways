import { readFileSync } from "node:fs";
import { checkSplit, declaredClaimOf, familyOf } from "@mark1russell7/layout-contract";
import { describe, expect, it } from "vitest";
import { checkProperties } from "../properties.ts";
import { noGraphRoutes } from "../measures/routes.ts";
import { STRATEGIES } from "../../strategies/builtins.ts";
import { asRouter, getStrategy } from "../../strategies/model.ts";
import { formatInput, inputGraph, passThroughs, type LayoutInput, type LayoutRecord } from "./forms.ts";
import { documentHash } from "./hash.ts";
import { formatScreen, screen } from "./screen.ts";
import { checkFamilies, familyCell, manifestHash, SCREEN_FAMILY_BY, SCREEN_SETS, SCREEN_V1, SCREEN_V2, SCREEN_V3, SCREEN_V4, SCREEN_V4_ROOM, screenInputs, screenSplit, setManifest, splitPath, type LayoutCorpus } from "./set.ts";

const v2 = screenInputs(SCREEN_V2);
const v4 = screenInputs(SCREEN_V4);
const root = new URL("../../../../../corpus/", import.meta.url);
const readJson = (path: string): unknown => JSON.parse(readFileSync(new URL(path, root), "utf8"));
const old = (id: string): LayoutInput => v2.find((i) => i.id === id)!;
const corners = asRouter(getStrategy(STRATEGIES, "router", "corners"));

describe("the screen set screen-v4 (PASS-GRID)", () => {
  it("has the 6 families of screen-v2, each with the 10 seeds 0 to 9", () => {
    expect(SCREEN_SETS["screen-v4"]).toBe(SCREEN_V4);
    expect(SCREEN_V4.families.map((f) => f.name)).toEqual(SCREEN_V2.families.map((f) => f.name));
    expect(v4).toHaveLength(60);
    expect(v4.map((i) => i.id)).toEqual(v2.map((i) => i.id.replace("screen-v2/", "screen-v4/")));
    for (const i of v4) expect(i.hash).toBe(documentHash(i));
  });

  it("gives the boards of screen-v2 after the room: the same edges, box sizes, seed and cell", () => {
    for (const input of v4) {
      const base = old(`screen-v2/${input.family}/s${input.seed}`);
      expect(input.edges, input.id).toEqual(base.edges);
      expect(input.cell, input.id).toEqual(base.cell);
      expect(input.boxes.map((b) => [b.id, b.w, b.h]), input.id).toEqual(base.boxes.map((b) => [b.id, b.w, b.h]));
      const { seed, ...generator } = base.generator!;
      expect(input.generator, input.id).toEqual({ name: "room", version: 1, params: { ...SCREEN_V4_ROOM, base: generator }, seed });
    }
  });

  it("matches the files in corpus/screen-v4 and its split file, and keeps the hashes of the other sets", () => {
    for (const input of v4) {
      const file = readJson(`screen-v4/${input.family}/s${input.seed}.json`) as LayoutInput;
      expect(file, input.id).toEqual(input);
      expect(JSON.parse(formatInput(input))).toEqual(input);
    }
    const manifest = readJson("screen-v4/corpus.json") as LayoutCorpus;
    expect(manifest).toEqual(setManifest(SCREEN_V4, v4));
    expect(manifestHash(manifest)).toBe("c439a5c1a0afcd39");
    const split = screenSplit(SCREEN_V4)!;
    expect(splitPath(split)).toBe("splits/screen-v4.c439a5c1a0afcd39.json");
    expect(readJson(splitPath(split))).toEqual(split);
    expect(checkSplit(split, manifest, "default")).toEqual([]);
    expect(checkSplit(split, manifest, "by-member")).toEqual([]);
    expect(manifestHash(setManifest(SCREEN_V1))).toBe("e5fe56d1069d2a18");
    expect(manifestHash(setManifest(SCREEN_V2, v2))).toBe("35795acefa7148c3");
    expect(manifestHash(setManifest(SCREEN_V3))).toBe("f9fc4d8823ded6e5");
  });

  it("passes the claim declared of its manifest, and gives each input the key of its family", () => {
    const manifest = readJson("screen-v4/corpus.json") as LayoutCorpus;
    expect(declaredClaimOf(manifest)).toMatchObject({ minCount: 10, familyMin: 10 });
    expect(checkFamilies(manifest, v4)).toEqual([]);
    for (const input of v4) expect(familyOf(familyCell(input), SCREEN_FAMILY_BY), input.id).toBe(input.family);
  });

  it("gives the corner graph room on the worst packed-grid seed", () => {
    const graph = inputGraph(v4.find((i) => i.id === "screen-v4/packed-grid/s8")!);
    const { routes } = corners.route(graph);
    expect(checkProperties(graph, { routes }, 1_000_000).filter((v) => v.rule === "no-pass-through")).toEqual([]);
    expect(noGraphRoutes(graph, routes)).toBe(0);
  });
});

describe("the routes with no graph (R17)", () => {
  const input = old("screen-v2/packed-grid/s8");
  const graph = inputGraph(input);

  it("counts the 133 straight routes of corners on the seed s8, and no route of a board with a graph", () => {
    expect(noGraphRoutes(graph, corners.route(graph).routes)).toBe(133);
    const open = inputGraph(old("screen-v2/tiny-uniform/s0"));
    expect(noGraphRoutes(open, corners.route(open).routes)).toBe(0);
  });

  it("does not count a route with a bend: that route has its own way", () => {
    const { routes } = corners.route(graph);
    const bent = routes.map((r) => ({ ...r, points: [r.points[0]!, { x: r.points[0]!.x, y: r.points[1]!.y }, r.points[1]!] }));
    expect(noGraphRoutes(graph, bent)).toBe(0);
  });

  it("writes the measure in the record, and the absolute counts in the summary", () => {
    const { records, summary } = screen("router", ["corners"], { inputs: [input], baseline: false });
    expect(records[0]!.measures["route.no-graph"]).toBe(133);
    const row = summary.strategies[0]!;
    expect(row.noGraph).toBe(133);
    expect(row.through).toBe(records[0]!.hard["no-pass-through"]);
    expect(row.through).toBe(97);
    expect(formatScreen(summary)).toContain("| over the floor | through | no graph |");
    expect(formatScreen(summary)).toContain(`| ${row.hardTotal} | ${row.hardOverFloor} | 97 | 133 |`);
  });

  it("sums the breaks of one strategy, and a record without the rule counts 0", () => {
    const record = (strategy: string, hard: Record<string, number>): LayoutRecord => ({ strategy, hard }) as unknown as LayoutRecord;
    const records = [record("a", { "no-pass-through": 3 }), record("b", { "no-pass-through": 5 }), record("a", { "no-pass-through": 4 }), record("a", {})];
    expect(passThroughs(records, "a")).toBe(7);
    expect(passThroughs(records, "c")).toBe(0);
  });
});
