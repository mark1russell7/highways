import { mulberry32, seedOf } from "@mark1russell7/rigor-generators";
import { describe, expect, it } from "vitest";
import { countCrossings, paintedOutsidePairs, routePairCrossings } from "./quality.ts";

type Xy = readonly [number, number];
const route = (...points: readonly Xy[]) => ({ points: points.map(([x, y]) => ({ x, y })) });
const count = (...routes: readonly (readonly Xy[])[]) => routePairCrossings(routes.map((p) => route(...p)));

describe("paintedOutsidePairs", () => {
  const read = (...routes: readonly (readonly Xy[])[]) => paintedOutsidePairs(routes.map((p) => route(...p)));

  it("reads a proper crossing of two routes in neither class", () => {
    expect(read([[0, 0], [10, 10]], [[0, 10], [10, 0]])).toEqual({ crossings: 1, self: 0, touch: 0 });
  });

  it("reads a route that crosses itself in the class `self`, and the pair count leaves it out", () => {
    const loop = [[0, 0], [10, 10], [0, 10], [10, 0]] as const;
    expect(read(loop)).toEqual({ crossings: 1, self: 1, touch: 0 });
    expect(count(loop).pairs).toBe(0);
  });

  it("does not read a crossing in the class `self` when a second route draws one of the segments", () => {
    const loop = [[0, 0], [10, 10], [0, 10], [10, 0]] as const;
    expect(read(loop, [[0, 0], [10, 10]])).toEqual({ crossings: 1, self: 0, touch: 0 });
    expect(count(loop, [[0, 0], [10, 10]]).pairs).toBeGreaterThan(0);
  });

  it("reads a route that ends on another route, up to rounding, in the class `touch`, and the pair count leaves it out", () => {
    // The float test reads a strict crossing, because the end lies 1e-9 past the line. The grid `EPS` reads the end on the line.
    const ending = [[0, 0], [10 + 1e-9, 5]] as const;
    const line = [[10, 0], [10, 10]] as const;
    expect(read(ending, line)).toEqual({ crossings: 1, self: 0, touch: 1 });
    expect(count(ending, line).pairs).toBe(0);
  });

  it("reads outside the relation when a second route nearly draws a segment of a route that crosses itself", () => {
    // The ends (10, 0) and (9.95, 0) round to one key of the painted segments. So that segment has two owners, and the crossing at x 9.97 is not `self`.
    // The second route stops before x 9.97, so the pair count reads no crossing of the two routes.
    const crossing = [[0, 0], [10, 0], [10, -5], [9.97, -5], [9.97, 5]] as const;
    const near = [[0, 0], [9.95, 0]] as const;
    expect(read(crossing, near)).toEqual({ crossings: 1, self: 0, touch: 0 });
    expect(count(crossing, near).pairs).toBe(0);
    // The copy with no second route stays inside the relation.
    expect(read(crossing)).toEqual({ crossings: 1, self: 1, touch: 0 });
    expect(count(crossing).pairs).toBe(0);
  });

  it("gives the painted count of `countCrossings` and holds the relation on seeded routes", () => {
    const random = mulberry32(seedOf("paintedOutsidePairs"));
    const point = (): Xy => [Math.round(random() * 200), Math.round(random() * 200)];
    for (let round = 0; round < 25; round++) {
      const routes = Array.from({ length: 12 }, () => route(point(), point(), point()));
      const outside = paintedOutsidePairs(routes);
      const segments = routes.flatMap((r) => r.points.slice(1).map((p, i) => [r.points[i]!, p] as const));
      const distinct = [...new Map(segments.filter(([a, b]) => a.x !== b.x || a.y !== b.y).map(([a, b]) => [[a, b].map((p) => `${p.x},${p.y}`).sort().join("|"), [a, b] as const])).values()];
      expect(outside.crossings).toBe(countCrossings(distinct)[0]);
      expect(outside.crossings - outside.self - outside.touch).toBeLessThanOrEqual(routePairCrossings(routes).pairs);
    }
  });
});

describe("routePairCrossings", () => {
  it("counts a proper crossing of two routes", () => {
    expect(count([[0, 0], [10, 10]], [[0, 10], [10, 0]])).toEqual({ pairs: 1, proper: 1, contact: 0, estimated: false });
  });

  it("counts no crossing of parallel routes, of equal routes or of one route", () => {
    expect(count([[0, 0], [10, 0]], [[0, 5], [10, 5]]).pairs).toBe(0);
    expect(count([[0, 0], [10, 0]], [[0, 0], [10, 0]]).pairs).toBe(0);
    expect(count([[0, 0], [10, 10], [0, 10], [10, 0]]).pairs).toBe(0);
  });

  it("multiplies a crossing of two trunks by the routes on each trunk", () => {
    const across = [[0, 0], [10, 10]] as const;
    const other = [[0, 10], [10, 0]] as const;
    const out = count(across, across, across, other, other);
    expect(out.proper).toBe(6);
  });

  it("does not count a crossing of two segments of one route as a pair", () => {
    // The first route is on both segments that cross, so the pair of it with itself leaves the count.
    const loop = [[0, 0], [10, 10], [0, 10], [10, 0]] as const;
    const single = [[0, 0], [10, 10]] as const;
    expect(count(loop, single).proper).toBe(1);
  });

  it("counts two routes that cross at a shared vertex", () => {
    expect(count([[0, 0], [5, 5], [10, 10]], [[0, 10], [5, 5], [10, 0]])).toEqual({ pairs: 1, proper: 0, contact: 1, estimated: false });
  });

  it("does not count two routes that touch at a shared vertex and come back", () => {
    expect(count([[0, 0], [5, 5], [10, 0]], [[0, 10], [5, 5], [10, 10]]).pairs).toBe(0);
  });

  it("does not count a route that ends on another route", () => {
    expect(count([[0, 0], [5, 0], [10, 0]], [[5, 10], [5, 0]]).pairs).toBe(0);
    // The vertex (5, 0) is not a vertex of the first route, so the count adds it.
    expect(count([[0, 0], [10, 0]], [[5, 10], [5, 0]]).pairs).toBe(0);
  });

  it("counts a shared stretch that two routes leave on opposite sides", () => {
    const a = [[0, 10], [5, 0], [15, 0], [20, -10]] as const;
    const b = [[0, -10], [5, 0], [15, 0], [20, 10]] as const;
    expect(count(a, b)).toEqual({ pairs: 1, proper: 0, contact: 1, estimated: false });
  });

  it("does not count a shared stretch that two routes leave on one side", () => {
    const a = [[0, 10], [5, 0], [15, 0], [20, 10]] as const;
    const b = [[0, -10], [5, 0], [15, 0], [20, -10]] as const;
    expect(count(a, b).pairs).toBe(0);
    const c = [[0, 10], [5, 0], [15, 0], [20, 10]] as const;
    const d = [[-2, 10], [5, 0], [15, 0], [22, 10]] as const;
    expect(count(c, d).pairs).toBe(0);
  });

  it("counts a stretch of routes in opposite directions one time", () => {
    const a = [[0, 10], [5, 0], [15, 0], [20, -10]] as const;
    const b = [[20, 10], [15, 0], [5, 0], [0, -10]] as const;
    expect(count(a, b)).toEqual({ pairs: 1, proper: 0, contact: 1, estimated: false });
    expect(count(b, a).pairs).toBe(1);
    // Both ends of this route lie below, and at the right end it passes on the other side of the first route.
    const below = [[22, -10], [15, 0], [5, 0], [-2, -10]] as const;
    expect(count(a, below).pairs).toBe(1);
    // This route stays on one side of the first route.
    const clean = [[10, -10], [15, 0], [5, 0], [-2, -10]] as const;
    expect(count(a, clean).pairs).toBe(0);
    // The reverse of the first route shares all of it, so it does not leave.
    expect(count(a, [...a].reverse()).pairs).toBe(0);
  });

  it("does not count a stretch where a route ends", () => {
    const a = [[0, 10], [5, 0], [15, 0], [20, -10]] as const;
    expect(count(a, [[0, -10], [5, 0], [15, 0]]).pairs).toBe(0);
    expect(count(a, [[5, 0], [15, 0], [20, 10]]).pairs).toBe(0);
  });

  it("reads a stretch with different vertices on each route as one stretch", () => {
    const a = [[0, 10], [5, 0], [15, 0], [20, -10]] as const;
    const b = [[0, -10], [5, 0], [10, 0], [15, 0], [20, 10]] as const;
    expect(count(a, b).pairs).toBe(1);
  });

  it("gives the same value in another route order, and over a mirror of the board", () => {
    const routes = [
      [[0, 10], [5, 0], [15, 0], [20, -10]],
      [[0, -10], [5, 0], [15, 0], [20, 10]],
      [[10, -10], [10, 0], [10, 10]],
      [[2, 12], [18, -12]],
    ] as const;
    const base = count(...routes);
    expect(count(...[...routes].reverse())).toEqual(base);
    const mirror = routes.map((r) => r.map(([x, y]) => [x, -y] as const));
    expect(count(...mirror)).toEqual(base);
    expect(base.pairs).toBeGreaterThan(0);
  });

  it("gives the same count under a shift below the grid, away from a half step", () => {
    const routes = [
      [[0.25, 10.25], [5.25, 0.25], [15.25, 0.25], [20.25, -9.75]],
      [[0.25, -9.75], [5.25, 0.25], [15.25, 0.25], [20.25, 10.25]],
    ] as const;
    const base = count(...routes);
    for (const move of [1e-12, 1e-10, 1e-8, 1e-7]) {
      const moved = routes.map((r) => r.map(([x, y], i) => [x + (i % 2 ? move : -move), y + move] as const));
      expect(count(...moved)).toEqual(base);
    }
  });

  /** This function draws a walk on a coarse grid, so that walks share vertices and stretches. Both ends go out to their own points on a large circle. */
  function walks(name: string, routes: number): { readonly points: Xy[]; readonly ends: readonly [number, number] }[] {
    const random = mulberry32(seedOf(name));
    const steps = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [-1, 1]] as const;
    const angles = Array.from({ length: 2 * routes }, (_, i) => (i + 0.37) / (2 * routes));
    for (let i = angles.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [angles[i], angles[j]] = [angles[j]!, angles[i]!];
    }
    const onCircle = (share: number): Xy => {
      // A polygon with many sides stands in for the circle. A corner of a square has the same order of the ends.
      const t = 4 * share;
      const side = Math.floor(t);
      const f = t - side;
      const q: Xy = side === 0 ? [-1 + 2 * f, -1] : side === 1 ? [1, -1 + 2 * f] : side === 2 ? [1 - 2 * f, 1] : [-1, 1 - 2 * f];
      return [1000 * q[0], 1000 * q[1]];
    };
    return Array.from({ length: routes }, (_, r) => {
      let [x, y] = [Math.floor(random() * 3), Math.floor(random() * 3)];
      const inner: Xy[] = [[x * 10, y * 10]];
      let last = -1;
      for (let i = 0; i < 2 + Math.floor(random() * 7); i++) {
        let pick = Math.floor(random() * steps.length);
        // A walk does not go straight back, because a spike has no side.
        const back = (a: number, b: number): boolean => steps[a]![0] === -steps[b]![0] && steps[a]![1] === -steps[b]![1];
        if (last >= 0 && back(pick, last)) pick = (pick + 1) % steps.length;
        x += steps[pick]![0];
        y += steps[pick]![1];
        inner.push([x * 10, y * 10]);
        last = pick;
      }
      const ends = [angles[2 * r]!, angles[2 * r + 1]!] as const;
      return { points: [onCircle(ends[0]), ...inner, onCircle(ends[1])], ends };
    });
  }

  it("gives two routes with interleaved ends on a closed curve an odd count, and others an even count", () => {
    let odd = 0;
    let shared = 0;
    for (let board = 0; board < 400; board++) {
      const [a, b] = walks(`route-pairs/parity/${board}`, 2) as [ReturnType<typeof walks>[number], ReturnType<typeof walks>[number]];
      const [x0, x1] = [Math.min(...a.ends), Math.max(...a.ends)];
      const inside = (t: number): boolean => t > x0 && t < x1;
      const interleaved = inside(b.ends[0]) !== inside(b.ends[1]);
      const out = count(a.points, b.points);
      if (out.contact > 0) shared++;
      if (interleaved) odd++;
      expect(out.pairs % 2 === 1, `board ${board}`).toBe(interleaved);
    }
    // The test reads both parities, and boards with contact crossings.
    expect(odd).toBeGreaterThan(100);
    expect(shared).toBeGreaterThan(50);
  });

  it("gives the sum of the counts of each pair of routes", () => {
    for (let board = 0; board < 60; board++) {
      const list = walks(`route-pairs/sum/${board}`, 6).map((w) => w.points);
      let sum = 0;
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) sum += count(list[i]!, list[j]!).pairs;
      expect(count(...list).pairs, `board ${board}`).toBe(sum);
    }
  });

  it("reads all routes up to the point limit, so the count with the limit equals the full count (BENCH-PAIRS-HEAP)", () => {
    const routes = walks("route-pairs/limit/full", 30).map((w) => route(...w.points));
    const points = routes.reduce((sum, r) => sum + r.points.length, 0);
    expect(routePairCrossings(routes, { maxPoints: points })).toEqual(routePairCrossings(routes));
  });

  it("reads a seeded sample of the routes above the point limit, and the mean of the scaled counts is the full count", () => {
    const routes = walks("route-pairs/limit/sample", 80).map((w) => route(...w.points));
    const points = routes.reduce((sum, r) => sum + r.points.length, 0);
    const full = routePairCrossings(routes);
    const one = routePairCrossings(routes, { maxPoints: points / 2 });
    expect(one.estimated).toBe(true);
    expect(one.pairs).toBe(one.proper + one.contact);
    expect(routePairCrossings(routes, { maxPoints: points / 2 })).toEqual(one);
    // The scaled count of a sample has no bias. So the mean over 60 seeds comes near the full count.
    const seeds = Array.from({ length: 60 }, (_, seed) => routePairCrossings(routes, { maxPoints: points / 2, seed }).pairs);
    const mean = seeds.reduce((sum, v) => sum + v, 0) / seeds.length;
    expect(full.pairs).toBeGreaterThan(500);
    expect(Math.abs(mean - full.pairs) / full.pairs).toBeLessThan(0.03);
  });
});
