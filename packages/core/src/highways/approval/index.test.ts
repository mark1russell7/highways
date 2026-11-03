import { describe, expect, it } from "vitest";
import { checkProperties } from "../../bench/properties.ts";
import type { Graph } from "../../model.ts";
import { highwayStrategies } from "../../strategies/builtins.ts";
import { checkOptions } from "../../strategies/options.ts";
import { box, commonTests, flows, parallel } from "../fixtures.test-util.ts";
import { follow } from "../follow.ts";
import { checkPlan } from "../model.ts";
import { APPROVAL_DEFAULTS, approvalPlan, pickLinks } from "./index.ts";

/** Three edges from the left to the right, and a tall wall between them. Each way goes past one end of the wall. */
const blocked: Graph = {
  nodes: [
    ...[0, 1, 2].flatMap((i) => [
      { id: `l${i}`, box: box(0, 30 * i) },
      { id: `r${i}`, box: box(600, 30 * i) },
    ]),
    { id: "wall", box: box(280, -80, 40, 240) },
  ],
  edges: [0, 1, 2].map((i) => ({ id: `e${i}`, source: { node: `l${i}` }, target: { node: `r${i}` } })),
};

describe("the highway strategy approval (WILD-031)", () => {
  it("picks the links with the most approvals, or a greedy cover of the edges", () => {
    // The link 1 has three approvals, the links 2 and 3 have two, and the link 4 has one.
    const approvals = [new Set([1, 2]), new Set([1, 2, 3]), new Set([1, 3]), new Set([4])];
    expect([...pickLinks(approvals, { budget: 0.5, minSize: 2, pick: "score" })]).toEqual([1, 2]);
    expect([...pickLinks(approvals, { budget: 0.5, minSize: 2, pick: "cover" })]).toEqual([1]);
    expect([...pickLinks(approvals, { budget: 0.5, minSize: 4, pick: "score" })]).toEqual([]);
    expect([...pickLinks(approvals, { budget: 0.25, minSize: 2, pick: "score" })]).toEqual([1]);
  });

  it("makes a corridor past the wall that the three edges share", () => {
    const plan = approvalPlan({ graph: blocked }, APPROVAL_DEFAULTS);
    expect(checkPlan(blocked, plan)).toEqual([]);
    expect(plan.highways.length).toBeGreaterThan(0);
    expect(Math.max(...plan.highways.map((h) => h.members.length))).toBeGreaterThanOrEqual(2);
    const result = follow(blocked, plan);
    expect(checkProperties(blocked, result, 1_000_000)).toEqual([]);
    expect(result.runs?.length ?? 0).toBeGreaterThan(0);
  });

  it("makes no corridor for edges with a straight line of sight", () => {
    expect(approvalPlan({ graph: parallel }, APPROVAL_DEFAULTS).highways).toEqual([]);
  });

  it("makes no corridor when a link needs more approvals than the edges", () => {
    expect(approvalPlan({ graph: blocked }, { ...APPROVAL_DEFAULTS, minSize: 4 }).highways).toEqual([]);
  });

  it("declares each option in its schema", () => {
    expect(checkOptions(highwayStrategies.approval, APPROVAL_DEFAULTS)).toEqual([]);
  });

  commonTests("approval", APPROVAL_DEFAULTS, approvalPlan, [flows, blocked]);
});
