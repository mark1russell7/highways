import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { STRATEGIES } from "./builtins.ts";
import { listStrategies, STEPS, type AnyStrategy, type Step } from "./model.ts";
import { ALL_STRATEGIES, BASELINE_STRATEGIES, KEYED_STRATEGIES, keyOfStrategy, OPT_IN_STRATEGIES, STEP_DEFAULTS, strategyOfKey, UNSCREENED_STRATEGIES } from "./opt-in.ts";

const DEFAULT_ROUTERS = ["straight", "plugs", "corners", "corners-smooth", "trunks", "shared", "shared-all", "sections", "sections-tree"];

describe("the opt-in strategies (PHYSICAL-VISIBLE)", () => {
  it("has the 11 opt-in routers, in the order of their names", () => {
    const names = OPT_IN_STRATEGIES.map((s) => s.name);
    expect(names).toEqual(["adam", "annealing", "attraction", "canals", "nudge", "portfolio", "repel", "reroute", "shared-stretch", "springs", "tight"]);
    for (const s of OPT_IN_STRATEGIES) expect(s.step, s.name).toBe("router");
  });

  it("leaves `STRATEGIES` with the 9 default routers, so a bench or a screen gets no new row", () => {
    expect(listStrategies(STRATEGIES, "router").map((s) => s.name)).toEqual(DEFAULT_ROUTERS);
  });

  it("adds only the opt-in routers in `ALL_STRATEGIES`, after the default routers", () => {
    for (const step of STEPS) {
      const all = listStrategies(ALL_STRATEGIES, step);
      const base = listStrategies(STRATEGIES, step);
      expect(all.slice(0, base.length)).toEqual(base);
      expect(all.slice(base.length)).toEqual(step === "router" ? OPT_IN_STRATEGIES : []);
    }
  });

  it("names a built-in strategy of its step in each step default", () => {
    for (const [step, name] of Object.entries(STEP_DEFAULTS)) expect(listStrategies(STRATEGIES, step as Step).map((s) => s.name), step).toContain(name);
  });
});

describe("the keys of the strategies (CATALOG-LOOKUP)", () => {
  const every = STEPS.flatMap((step) => listStrategies(KEYED_STRATEGIES, step) as readonly AnyStrategy[]);

  it("gives each strategy from its key, and no two strategies share a key", () => {
    for (const s of every) expect(strategyOfKey(keyOfStrategy(s)), keyOfStrategy(s)).toEqual({ ok: true, strategy: s });
    expect(new Set(every.map(keyOfStrategy)).size).toBe(every.length);
  });

  it("holds the built-in strategies and the 13 opt-in strategies, with no remainder", () => {
    const builtIn = STEPS.flatMap((step) => listStrategies(STRATEGIES, step) as readonly AnyStrategy[]);
    expect(builtIn).toHaveLength(107);
    const listed = [...builtIn, ...OPT_IN_STRATEGIES, ...BASELINE_STRATEGIES, ...UNSCREENED_STRATEGIES];
    expect(listed).toHaveLength(120);
    expect(new Set(every)).toEqual(new Set(listed));
    expect(BASELINE_STRATEGIES.map(keyOfStrategy)).toEqual(["highway/shared-ways-all"]);
    expect(UNSCREENED_STRATEGIES.map(keyOfStrategy)).toEqual(["router/seams"]);
  });

  it("has each strategy of the source, so a strategy on no list fails", () => {
    const filesOf = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const path = join(dir, f);
        return statSync(path).isDirectory() ? filesOf(path) : path.endsWith(".ts") && !path.includes(".test.") ? [path] : [];
      });
    const keys = filesOf(fileURLToPath(new URL("..", import.meta.url))).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/defineStrategy(?:<[^>]*>)?\(\{\s*step:\s*"(\w+)",\s*name:\s*"([^"]+)"/g)].map((m) => `${m[1]}/${m[2]}`),
    );
    // The form of the source can change, and a search that finds little proves nothing.
    expect(keys.length).toBeGreaterThan(60);
    expect(keys.filter((key) => !strategyOfKey(key).ok)).toEqual([]);
  });

  it("keeps the same name in two steps apart", () => {
    const pair = (["keys", "straight"] as const).map((name) => STEPS.filter((step) => strategyOfKey(`${step}/${name}`).ok));
    expect(pair.map((steps) => steps.length > 1)).toEqual([true, true]);
  });

  it("gives a reason for a key with no strategy", () => {
    expect(strategyOfKey("adam")).toEqual({ ok: false, reason: "The key adam has no step. A key has the form step/name." });
    expect(strategyOfKey("router/no-such")).toEqual({ ok: false, reason: "The step router has no strategy no-such." });
    expect(strategyOfKey("no-step/adam").ok).toBe(false);
    expect(strategyOfKey("/adam").ok).toBe(false);
    expect(strategyOfKey("router/").ok).toBe(false);
  });

  it("reads the registry of the caller", () => {
    expect(strategyOfKey("router/adam", STRATEGIES).ok).toBe(false);
    expect(strategyOfKey("router/seams", ALL_STRATEGIES).ok).toBe(false);
  });
});
