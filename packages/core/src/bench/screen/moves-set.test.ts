import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as w3f from "../../../scripts/screens/build-w3f.ts";
import { highwaysByName, isStrategy } from "../../../scripts/screens/meas2.ts";
import { follow } from "../../highways/follow.ts";
import { edgeLengths } from "../../highways/gates/model.ts";
import { channelOverflows, LANES_DEFAULTS, lanesPlan } from "../../highways/lanes/index.ts";
import type { HighwayPlan } from "../../highways/model.ts";
import type { Graph } from "../../model.ts";
import type { Strategy } from "../../strategies/model.ts";
import { exercised } from "./activation.ts";
import { activationBase, planMoves, resultHash } from "./exercise.ts";
import { formatInput, inputGraph, type LayoutInput } from "./forms.ts";
import { documentHash } from "./hash.ts";
import { MOVE_BOARDS, MOVES_V1, type MoveBoard } from "./moves-set.ts";
import { corpusManifest, SCREEN_SETS, SCREEN_V1, screenInputs, type LayoutCorpus } from "./set.ts";

/** The 15 strategies of the catalog that go to a rebuild (ACTIVATION). `hw:corridors+ids` and `w2a:shared-ways+ids` show their move on the edit screen. */
const SILENT = [
  "hw:power",
  "w3e:power-near",
  "w3e:power-saved1",
  "w3e:power+stretch",
  "hw:corridors+breakeven",
  "hw:corridors+stretch",
  "w2a:corridors+breakeven-a0",
  "w2a:corridors+stretch-1.1",
  "w2a:corridors+stretch-1.5",
  "w2a:corridors+stretch+breakeven",
  "w3b:lanes-corridors",
  "w2c:flow-field+stretch",
  "w3f:consensus+stretch",
  "w3f:link-communities+stretch",
  "w3f:scale-space+stretch",
];

const none = { run: (): HighwayPlan => ({ highways: [] }), defaults: {} } as unknown as Strategy<"highway", object>;

/** The highway strategies of the activation screen, by the names of the records. */
const strategies: Readonly<Record<string, Strategy<"highway", object>>> = {
  ...highwaysByName,
  "hw:none": none,
  ...Object.fromEntries(
    Object.values(w3f as Record<string, unknown>)
      .filter(isStrategy)
      .filter((s) => s.step === "highway")
      .map((s) => [`w3f:${s.name}`, s as Strategy<"highway", object>] as const),
  ),
};
const known = new Set(Object.keys(strategies));

const planOf = (name: string, graph: Graph): HighwayPlan => {
  const s = strategies[name]!;
  return s.run({ graph }, s.defaults);
};

const board = (name: string): MoveBoard => MOVE_BOARDS.find((b) => b.name === name)!;
const worstStretch = (graph: Graph, plan: HighwayPlan): number => Math.max(...[...edgeLengths(graph, plan, {}).values()].map((l) => l.route / l.alone));

describe("the boards of REBUILD-SILENT", () => {
  it("give each of the 15 silent strategies one board", () => {
    expect(MOVE_BOARDS.flatMap((b) => b.strategies).sort()).toEqual([...SILENT].sort());
  });

  for (const { name, strategies: names, graph } of MOVE_BOARDS)
    for (const strategy of names)
      it(`${strategy} does its own move on the board ${name}`, () => {
        const base = activationBase(strategy, known)!;
        const plan = planOf(strategy, graph);
        const moves = planMoves(strategy, plan);
        const hash = resultHash(follow(graph, plan));
        const baseHash = resultHash(follow(graph, planOf(base, graph)));
        expect(hash).not.toBe(baseHash);
        expect(exercised({ ...(moves === undefined ? {} : { moves }), hashes: [hash], baseHashes: [baseHash] })).toBe(true);
      });

  it("show the rule of each module of power", () => {
    const near = board("near-neighbours").graph;
    expect(planOf("hw:power", near).highways.map((h) => h.members.length).sort((a, b) => a - b)).toEqual([4, 4, 16]);
    expect(planOf("w3e:power-near", near).highways.map((h) => h.members.length)).toEqual([24]);
    const leaves = board("leaf-pair").graph;
    expect(planMoves("hw:power", planOf("hw:power", leaves))).toEqual({ "move.powerEdge": 0 });
    expect(planMoves("w3e:power-saved1", planOf("w3e:power-saved1", leaves))).toEqual({ "move.powerEdge": 1 });
    expect(planOf("w3e:power+stretch", board("spread-modules").graph).highways).toEqual([]);
  });

  it("show a detour above the budget of a short route on short-link", () => {
    const short = board("short-link").graph;
    expect(worstStretch(short, planOf("hw:flow-field", short))).toBeGreaterThan(1.2);
    expect(planOf("w2c:flow-field+stretch", short).highways).toEqual([]);
  });

  it("show a detour above each stretch budget on hidden-plug, and only break-even cuts on small-saving", () => {
    const hidden = board("hidden-plug").graph;
    expect(worstStretch(hidden, planOf("hw:corridors", hidden))).toBeGreaterThan(1.5);
    const small = board("small-saving").graph;
    const corridors = planOf("hw:corridors", small);
    expect(worstStretch(small, corridors)).toBeGreaterThan(1.1);
    expect(worstStretch(small, corridors)).toBeLessThan(1.2);
    expect(planOf("hw:corridors+stretch", small)).toEqual(corridors);
    expect(planOf("hw:corridors+breakeven", small).highways).toEqual([]);
  });

  it("show the wrong trigger of lanes: the old rule stays silent, and the rule of all the lanes removes the overflow", () => {
    const check = (graph: Graph): void => {
      const corridors = planOf("hw:corridors", graph);
      const old = lanesPlan({ graph }, { ...LANES_DEFAULTS, from: "corridors" });
      const fixed = planOf("w3b:lanes-corridors", graph);
      expect(channelOverflows(graph, corridors, LANES_DEFAULTS)).toBe(1);
      expect(resultHash(follow(graph, old))).toBe(resultHash(follow(graph, corridors)));
      expect(resultHash(follow(graph, fixed))).not.toBe(resultHash(follow(graph, corridors)));
      expect(channelOverflows(graph, fixed, LANES_DEFAULTS)).toBe(0);
    };
    check(board("half-fits").graph);
    check(inputGraph(screenInputs(SCREEN_V1).find((i) => i.id === "screen-v1/dense-groups/s0")!));
  });
});

describe("the screen set moves-v1 (REBUILD-SILENT)", () => {
  const inputs = screenInputs(MOVES_V1);

  it("has one input for each board, with ids of the form moves-v1/<board>/s0", () => {
    expect(SCREEN_SETS["moves-v1"]).toBe(MOVES_V1);
    expect(inputs.map((i) => i.id)).toEqual(MOVE_BOARDS.map((b) => `moves-v1/${b.name}/s0`));
    for (const input of inputs) expect(inputGraph(input).edges.length, input.id).toBe(board(input.family).graph.edges.length);
  });

  it("matches the files in corpus/moves-v1", () => {
    const root = new URL("../../../../../corpus/moves-v1/", import.meta.url);
    for (const input of inputs) {
      const file = JSON.parse(readFileSync(new URL(`${input.family}/s${input.seed}.json`, root), "utf8")) as LayoutInput;
      expect(file, input.id).toEqual(input);
      expect(documentHash(file)).toBe(file.hash);
      expect(JSON.parse(formatInput(input))).toEqual(input);
    }
    const manifest = JSON.parse(readFileSync(new URL("corpus.json", root), "utf8")) as LayoutCorpus;
    expect(manifest).toEqual(corpusManifest("moves-v1", inputs));
  });
});
