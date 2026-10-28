import { fileURLToPath } from "node:url";
import { createRegistry, defineStrategy, listStrategies, STEPS, STRATEGIES, BUILT_IN_STRATEGIES } from "@mark1russell7/highways";
import { describe, expect, it } from "vitest";
import { benchTimes, breadthText, cardId, guaranteeOf, rangeText, statusCounts, statusOf, valueText } from "./strategies-data.ts";
import { readStrategies } from "./strategies-files.ts";

const root = fileURLToPath(new URL("../../../", import.meta.url));

describe("the strategy cards", () => {
  const data = readStrategies(root);

  it("have one card for each registered strategy of each step", () => {
    for (const step of STEPS) {
      expect(data.cards.filter((c) => c.step === step).map((c) => c.name), step).toEqual(listStrategies(STRATEGIES, step).map((s) => s.name));
    }
    expect(new Set(data.cards.map((c) => cardId(c.step, c.name))).size).toBe(data.cards.length);
    const linked = data.cards.filter((c) => c.ideas.length + c.optionIdeas.length > 0);
    const noRecord = data.cards.filter((c) => c.ideas.length + c.optionIdeas.length === 0).map((c) => `${c.step}/${c.name}`);
    console.log(`Cards: ${STEPS.map((s) => `${s} ${data.cards.filter((c) => c.step === s).length}`).join(", ")}. With an idea record: ${linked.length}. With no idea record: ${noRecord.join(", ")}.`);
    console.log(`Statuses: ${statusCounts(data.cards).map((s) => `${s.status} ${s.count}`).join(", ")}.`);
  });

  it("get a card for a strategy that the registry adds, with no change to the page", () => {
    const mine = defineStrategy({ step: "curve", name: "mine", describe: "A made-up curve.", defaults: {}, schema: {}, run: () => [] });
    const cards = readStrategies(root, createRegistry([...BUILT_IN_STRATEGIES, mine])).cards;
    expect(cards.find((c) => c.step === "curve" && c.name === "mine")?.status).toBe("built");
  });

  it("show each idea that a card names, with its sources", () => {
    for (const c of data.cards) for (const id of [...c.ideas, ...c.optionIdeas]) expect(data.ideas[id], `${c.name}: ${id}`).toBeDefined();
    const withSource = data.cards.filter((c) => [...c.ideas, ...c.optionIdeas].some((id) => data.ideas[id]!.sources.length > 0)).length;
    const noGuarantee = data.cards.filter((c) => ![...c.ideas, ...c.optionIdeas].some((id) => data.ideas[id]!.guarantee.length > 0)).length;
    console.log(`Cards with a source paper: ${withSource} of ${data.cards.length}. Cards with no stated guarantee: ${noGuarantee} of ${data.cards.length}.`);
  });

  it("give the verdicts of the snapshots and the times of the routers", () => {
    const corridors = data.cards.find((c) => c.step === "highway" && c.name === "corridors")!;
    expect(corridors.sets.map((s) => s.set)).toEqual(["screen-v1", "screen-v2"]);
    expect(corridors.sets[0]!.verdicts.length).toBeGreaterThan(0);
    expect(corridors.ideas).toContain("HWY-031");
    const shared = data.cards.find((c) => c.step === "router" && c.name === "shared")!;
    expect(shared.status).toBe("default");
    expect(shared.bench?.ratio).toBe(1);
    expect(data.cards.filter((c) => c.step === "router").every((c) => c.bench !== undefined)).toBe(true);
    expect(data.cards.find((c) => c.name === "weiszfeld")!.status).toBe("kept");
    expect(corridors.compare).toBe("#step=highway&pick=corridors");
  });
});

describe("the parts of a card", () => {
  it("give the range and the default of an option as text", () => {
    expect(rangeText({ type: "integer", min: 16, max: 128, step: 16, scale: "log" })).toBe("16 to 128, step 16, log scale");
    expect(rangeText({ type: "enum", values: ["a", "b"] })).toBe("a, b");
    expect(rangeText({ type: "function" })).toBe("no range");
    expect(valueText(Infinity)).toBe("Infinity");
    expect(valueText(function byKey() {})).toBe("the function `byKey`");
  });

  it("give the breadth of a verdict", () => {
    expect(breadthText("better", { against: 2, of: 6, ties: 1 }, [])).toBe("worse on 2 of 6 (1 tie)");
    expect(breadthText("depends on the mix", { against: 2, of: 4, ties: 0 }, [1, -1, -1, 0])).toBe("wins 1, loses 2 of 4");
  });

  it("find the sentences that state a guarantee", () => {
    expect(guaranteeOf({ math: "Ratio 2 to the optimum. The rest.", cost: "O(n log n)." })).toEqual(["Ratio 2 to the optimum."]);
    expect(guaranteeOf({ math: "d = |a - b|.", cost: "O(n)." })).toEqual([]);
  });

  it("give the status of a strategy", () => {
    expect(statusOf("router", "shared", [], true)).toBe("default");
    expect(statusOf("highway", "x", ["screened", "kept"], true)).toBe("kept");
    expect(statusOf("highway", "x", ["dropped", "prototyped"], true)).toBe("dropped");
    expect(statusOf("highway", "x", ["prototyped"], true)).toBe("screened");
    expect(statusOf("curve", "x", [], false)).toBe("built");
  });

  it("pair the times with the times of shared on the same fixtures", () => {
    const t = benchTimes([
      { router: "shared", fixture: "a", ms: 2 },
      { router: "shared", fixture: "b", ms: 4 },
      { router: "x", fixture: "a", ms: 1 },
      { router: "x", fixture: "b", ms: 4 },
      { router: "x", fixture: "c", ms: 9 },
    ]);
    expect(t.get("x")).toEqual({ fixtures: 3, medianMs: 4, ratio: 0.75 });
  });
});
