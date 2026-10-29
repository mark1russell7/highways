import { inkSaved } from "../../bench/measures/bundles.ts";
import { detourSpread } from "../../bench/measures/routes.ts";
import { checkProperties } from "../../bench/properties.ts";
import { measureQuality } from "../../bench/quality.ts";
import { rng } from "../../fixtures.ts";
import type { Graph } from "../../model.ts";
import type { Strategy, WholeOutput } from "../../strategies/model.ts";
import { runPipeline } from "../pipeline/index.ts";

/** The search of the whole strategy `fireflies`: the firefly algorithm, or the artificial bee colony. */
export type SwarmSearch = "firefly" | "bees";

/** The values of `SwarmSearch`. */
export const SWARM_SEARCHES: readonly SwarmSearch[] = Object.freeze(["firefly", "bees"]);

/** The options of the whole strategy `fireflies` (NAT-047). */
export interface FireflyOptions {
  /** The search. The default is `firefly`. */
  readonly search: SwarmSearch;
  /** The budget: the largest number of different settings that the search routes, from 4 to 40. The default is 12. */
  readonly budget: number;
  /** The number of fireflies or food sources, from 4 to 20. The default is 6. */
  readonly colony: number;
  /** The absorption `gamma` of the light of a firefly, from 0.01 to 10. The default is 1. */
  readonly gamma: number;
  /** The size `alpha` of the random step of a firefly, as a share of the range, from 0.01 to 0.5. The default is 0.2. */
  readonly alpha: number;
  /** The number of tries with no gain, after which a scout bee leaves a food source, from 10 to 100. The default is 10. */
  readonly limit: number;
  /** The seed of the search, a whole number from 0. The same seed gives the same routes. The default is 1. */
  readonly seed: number;
}

/** The default options of the strategy `fireflies`. */
export const FIREFLY_DEFAULTS: Readonly<FireflyOptions> = Object.freeze({ search: "firefly", budget: 12, colony: 6, gamma: 1, alpha: 0.2, limit: 10, seed: 1 });

/** The attraction of a firefly at the distance 0, as the record gives it. */
const BETA0 = 1;

/** The grid of the option `discount` of the router `shared`: 0.05 to 1 in steps of 0.05. */
const DISCOUNTS = 20;

/** The grid of the option `margin` of the router `shared`: 3 to 10 in steps of 1. */
const MARGINS = 8;

/** The largest number of rounds of a search. A round with no new setting still counts. */
const ROUNDS = 60;

/**
 * This function gives the attraction of a firefly at the distance `r`: `BETA0 / (1 + u + u² / 2)` with `u = gamma × r²`.
 * It is a rational stand-in for `BETA0 × exp(-u)`, with only `+`, `*` and `/`, so it is exact to the last bit on each platform.
 */
export function attraction(gamma: number, r2: number): number {
  const u = gamma * r2;
  return BETA0 / (1 + u + (u * u) / 2);
}

/** One setting of the router `shared`: the option `discount` and the option `margin`. */
export interface SwarmSetting {
  readonly discount: number;
  readonly margin: number;
}

/** This function gives the setting of a point of the unit square, on the grid of the search. */
export function settingAt(x: number, y: number): SwarmSetting {
  const i = Math.max(0, Math.min(DISCOUNTS - 1, Math.round(x * (DISCOUNTS - 1))));
  const j = Math.max(0, Math.min(MARGINS - 1, Math.round(y * (MARGINS - 1))));
  return { discount: (i + 1) / 20, margin: 3 + j };
}

/** The point of the unit square of the defaults of `shared`: the discount 0.5 and the margin 5. */
const HOME: readonly [number, number] = [9 / (DISCOUNTS - 1), 2 / (MARGINS - 1)];

/** One setting that the search routed: its score and its output. A setting with a break of a hard rule has the score `Infinity`. */
export interface SwarmEntry {
  readonly setting: SwarmSetting;
  readonly score: number;
  readonly output: WholeOutput;
}

/** The result of `fireflies`: the output, the best setting and each setting that the search routed, in order. */
export interface SwarmRun {
  readonly output: WholeOutput;
  readonly best: SwarmSetting;
  readonly entries: readonly SwarmEntry[];
}

/**
 * This function gives the score of an output on its board. A lower score is better.
 * The score is `crossings / edges + (median detour - 1) - ink saved`. A break of a hard rule gives `Infinity`.
 */
export function swarmScore(output: WholeOutput): number {
  if (checkProperties(output.graph, output.result, 1).length > 0) return Infinity;
  const edges = Math.max(1, output.result.routes.length);
  return measureQuality(output.graph, output.result).crossings / edges + (detourSpread(output.result.routes).median - 1) - inkSaved(output.result.routes);
}

/**
 * This function runs the whole strategy `fireflies` (NAT-047, after the firefly algorithm of Yang 2008 and the bee colony of Karaboga 2005).
 * It searches the options `discount` and `margin` of the router `router` on the board, on a grid of 20 × 8 settings.
 * The first firefly or food source is the default setting, so the score of the output is not worse than the score of the default.
 * A firefly moves toward each brighter one by `attraction(gamma, r²)` of the distance, plus a seeded step of size `alpha`.
 * A bee tries `v = x + phi (x - x_k)` in one dimension, and a scout takes a new seeded place after `limit` tries with no gain.
 * The search stops after `budget` different settings, or after 60 rounds. It reads only the board and the outputs of its own settings.
 */
export function fireflies(graph: Graph, router: Strategy<"router">, options: Partial<FireflyOptions> = {}): SwarmRun {
  const o = { ...FIREFLY_DEFAULTS, ...options };
  const budget = Math.max(1, Math.floor(o.budget));
  const random = rng(Math.max(0, Math.floor(o.seed)));
  const known = new Map<string, SwarmEntry>();
  const entries: SwarmEntry[] = [];
  const score = (x: number, y: number): number => {
    const setting = settingAt(x, y);
    const key = `${setting.discount}:${setting.margin}`;
    const seen = known.get(key);
    if (seen) return seen.score;
    if (entries.length >= budget) return Infinity;
    const output = runPipeline(graph, { router, routerOptions: { ...setting } });
    const entry = { setting, score: swarmScore(output), output };
    known.set(key, entry);
    entries.push(entry);
    return entry.score;
  };
  const clamp = (v: number): number => Math.max(0, Math.min(1, v));
  const colony = Math.max(2, Math.min(20, Math.floor(o.colony)));
  const xs: [number, number][] = [[HOME[0], HOME[1]]];
  while (xs.length < colony) xs.push([random(), random()]);
  const fs = xs.map(([x, y]) => score(x, y));
  if (o.search === "firefly") {
    for (let round = 0; round < ROUNDS && entries.length < budget; round++) {
      for (let i = 0; i < colony; i++) {
        for (let j = 0; j < colony; j++) {
          if (!(fs[j]! < fs[i]!)) continue;
          const dx = xs[j]![0] - xs[i]![0];
          const dy = xs[j]![1] - xs[i]![1];
          const b = attraction(o.gamma, dx * dx + dy * dy);
          xs[i] = [clamp(xs[i]![0] + b * dx + o.alpha * (random() - 0.5)), clamp(xs[i]![1] + b * dy + o.alpha * (random() - 0.5))];
          fs[i] = score(xs[i]![0], xs[i]![1]);
        }
      }
    }
  } else {
    const trials = new Array<number>(colony).fill(0);
    const tryNear = (i: number): void => {
      let k = Math.floor(random() * (colony - 1));
      if (k >= i) k++;
      const d = random() < 0.5 ? 0 : 1;
      const phi = 2 * random() - 1;
      const v: [number, number] = [xs[i]![0], xs[i]![1]];
      v[d] = clamp(v[d] + phi * (v[d] - xs[k]![d]));
      const f = score(v[0], v[1]);
      if (f < fs[i]!) {
        xs[i] = v;
        fs[i] = f;
        trials[i] = 0;
      } else trials[i]!++;
    };
    for (let round = 0; round < ROUNDS && entries.length < budget; round++) {
      for (let i = 0; i < colony; i++) tryNear(i);
      // The onlooker bees go to the sources by rank: the best source gets the most visits.
      const order = xs.map((_, i) => i).sort((a, b) => fs[a]! - fs[b]! || a - b);
      for (let r = 0; r < colony; r++) {
        const pick = order[Math.min(colony - 1, Math.floor(random() * random() * colony))]!;
        tryNear(pick);
      }
      const worn = trials.findIndex((t, i) => t > o.limit && fs[i]! !== Math.min(...fs));
      if (worn >= 0) {
        xs[worn] = [random(), random()];
        fs[worn] = score(xs[worn]![0], xs[worn]![1]);
        trials[worn] = 0;
      }
    }
  }
  let best = entries[0]!;
  for (const e of entries) if (e.score < best.score - 1e-12) best = e;
  return { output: best.output, best: best.setting, entries };
}
