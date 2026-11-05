/**
 * The highway strategy `savings` (WILD-033): a savings merge with a fair share, after the savings rule of Clarke and Wright (1964) and cost sharing.
 * Each edge starts as a bundle. The merge with the largest saving of ink goes first. A merge holds only when each edge pays no more than its way alone.
 */
import { dist, polylineLength, type Point } from "../../geom.ts";
import { MinHeap } from "../../visibility.ts";
import { WayFinder, type WayOptions } from "../../ways.ts";
import { bundleTerminal, groupedPlan, type EdgeGroup } from "../grouped.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { edgePlugs } from "../stretches.ts";

/** The rule that divides the trunk among the edges of a bundle: equal parts, or parts by the length of each edge alone. */
export type SavingsShare = "equal" | "length";

/** The values of `SavingsShare`. */
export const SAVINGS_SHARES: readonly SavingsShare[] = Object.freeze(["equal", "length"]);

/** The options of the highway strategy `savings` (WILD-033). */
export interface SavingsOptions extends Pick<WayOptions, "margin" | "k"> {
  /** Each bundle offers a merge to this number of nearest bundles, from 4 to 16. The default is 8. */
  readonly pairs: number;
  /** The way of an edge along a bundle is this many times its way alone or less, from 1.1 to 2. The default is 1.5. */
  readonly detour: number;
  /** The rule that divides the trunk among the edges. The default is `equal`. */
  readonly share: SavingsShare;
  /** A bundle with this number of edges or more gets a highway. The default is 2. */
  readonly minSize: number;
}

/** The default options of the strategy `savings`. */
export const SAVINGS_DEFAULTS: Readonly<Required<Omit<SavingsOptions, "margin" | "k">>> = Object.freeze({ pairs: 8, detour: 1.5, share: "equal", minSize: 2 });

/** This record gives the cost of one edge in a bundle. `own` is the length of its two legs, and `alone` is the length of its way alone. */
export interface SavingsRider {
  readonly own: number;
  readonly alone: number;
}

/**
 * This function tells if each edge of a bundle pays no more than its way alone (WILD-033).
 * An edge pays its share of `trunk`, its own legs and its detour: `share + own + max(0, ride - alone) ≤ alone`, with `ride = own + trunk`.
 * The way along the bundle also stays at `detour` times the way alone or less.
 */
export function fairMerge(riders: readonly SavingsRider[], trunk: number, o: Readonly<Pick<SavingsOptions, "detour" | "share">>): boolean {
  let total = 0;
  for (const r of riders) total += r.alone;
  for (const r of riders) {
    const part = o.share === "equal" ? trunk / riders.length : (trunk * r.alone) / Math.max(1e-9, total);
    const ride = r.own + trunk;
    if (ride > o.detour * r.alone + 1e-9) return false;
    if (part + r.own + Math.max(0, ride - r.alone) > r.alone + 1e-9) return false;
  }
  return true;
}

/** One edge in a bundle. With `flip`, the edge goes from the second end of the bundle to the first end. */
interface Ride {
  readonly i: number;
  readonly flip: boolean;
}

/** One bundle: its edges, the mean of each end and its ink. */
interface Bundle {
  readonly rides: readonly Ride[];
  readonly ca: Point;
  readonly cb: Point;
  readonly ink: number;
}

/** One offer of a merge. `exact` is true when `saving` comes from the searches of the corner graph. */
interface Offer {
  readonly p: number;
  readonly q: number;
  readonly rides: readonly Ride[];
  readonly saving: number;
  readonly exact: boolean;
}

/** This function gives the mean of the points. */
function mean(points: readonly Point[]): Point {
  let x = 0;
  let y = 0;
  for (const p of points) {
    x += p.x;
    y += p.y;
  }
  return { x: x / points.length, y: y / points.length };
}

/**
 * This function gives the group of each edge after the merges of WILD-033.
 * A heap holds the offers between near bundles. The key of an offer is its saving with straight lines, which is an upper bound of its true saving.
 * The top offer gets the searches of the corner graph. It goes back with its true saving unless that saving still leads, so the largest true saving merges first.
 * A straight test of `fairMerge` drops an offer before its searches, because longer lines only cost an edge more.
 */
export function savingsBundles(input: HighwayInput, o: Readonly<SavingsOptions>): Map<string, EdgeGroup> {
  const finder = new WayFinder(input.graph.nodes, { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
  const corners = finder.corners;
  const plugs = edgePlugs(input.graph);
  const ends = plugs.map(({ ps, pt }) => ({ a: finder.out(ps), b: finder.out(pt) }));
  const alone = ends.map(({ a, b }) => {
    const way = corners.path(a, b);
    return way ? polylineLength(way) : dist(a, b);
  });
  const bundles: (Bundle | undefined)[] = ends.map(({ a, b }, i) => ({ rides: [{ i, flip: false }], ca: a, cb: b, ink: alone[i]! }));
  const sideA = (r: Ride): Point => (r.flip ? ends[r.i]!.b : ends[r.i]!.a);
  const sideB = (r: Ride): Point => (r.flip ? ends[r.i]!.a : ends[r.i]!.b);
  const offers: Offer[] = [];
  const heap = new MinHeap();
  const push = (x: Offer): void => {
    offers.push(x);
    heap.push(-x.saving, offers.length - 1);
  };
  const nearOf = (p: Bundle, x: number): { q: number; flip: boolean }[] => {
    const near: { q: number; flip: boolean; d: number }[] = [];
    const count = Math.max(1, Math.floor(o.pairs));
    bundles.forEach((b, q) => {
      if (!b || q === x) return;
      const same = dist(p.ca, b.ca) + dist(p.cb, b.cb);
      const other = dist(p.ca, b.cb) + dist(p.cb, b.ca);
      const d = Math.min(same, other);
      if (near.length === count && d >= near[count - 1]!.d) return;
      // The list stays sorted, so a far bundle costs one comparison. The index `q` grows, so a tie keeps the least index.
      let at = near.length;
      while (at > 0 && near[at - 1]!.d > d) at--;
      near.splice(at, 0, { q, flip: other < same, d });
      if (near.length > count) near.pop();
    });
    return near;
  };
  const tried = new Set<number>();
  const limit = 2 * ends.length + 1;
  const offer = (p: number, q: number, flip: boolean): void => {
    const pair = Math.min(p, q) * limit + Math.max(p, q);
    if (tried.has(pair)) return;
    tried.add(pair);
    const A = bundles[p]!;
    const B = bundles[q]!;
    const rides = [...A.rides, ...(flip ? B.rides.map((r) => ({ i: r.i, flip: !r.flip })) : B.rides)];
    const ta = bundleTerminal(finder, rides.map(sideA));
    const tb = bundleTerminal(finder, rides.map(sideB));
    const trunk = dist(ta, tb);
    if (trunk <= finder.margin) return;
    const riders = rides.map((r) => ({ own: dist(sideA(r), ta) + dist(sideB(r), tb), alone: alone[r.i]! }));
    if (!fairMerge(riders, trunk, o)) return;
    const saving = A.ink + B.ink - riders.reduce((s, r) => s + r.own, trunk);
    if (saving > 1e-9) push({ p, q, rides, saving, exact: false });
  };
  const exactOffer = (x: Offer): Offer | undefined => {
    const ta = bundleTerminal(finder, x.rides.map(sideA));
    const tb = bundleTerminal(finder, x.rides.map(sideB));
    const spine = corners.path(ta, tb);
    if (!spine) return undefined;
    const trunk = polylineLength(corners.pull(spine));
    const riders: SavingsRider[] = [];
    for (const r of x.rides) {
      const inWay = corners.path(sideA(r), ta);
      const outWay = corners.path(tb, sideB(r));
      if (!inWay || !outWay) return undefined;
      riders.push({ own: polylineLength(inWay) + polylineLength(outWay), alone: alone[r.i]! });
    }
    if (!fairMerge(riders, trunk, o)) return undefined;
    const saving = bundles[x.p]!.ink + bundles[x.q]!.ink - riders.reduce((s, r) => s + r.own, trunk);
    return saving > 1e-9 ? { ...x, saving, exact: true } : undefined;
  };
  bundles.forEach((b, p) => {
    for (const { q, flip } of nearOf(b!, p)) offer(p, q, flip);
  });
  while (heap.size > 0) {
    const x = offers[heap.pop()]!;
    if (!bundles[x.p] || !bundles[x.q]) continue;
    const best = x.exact ? x : exactOffer(x);
    if (!best) continue;
    if (!x.exact && heap.size > 0 && best.saving < -heap.topKey) {
      push(best);
      continue;
    }
    const ink = bundles[x.p]!.ink + bundles[x.q]!.ink - best.saving;
    const fresh: Bundle = { rides: best.rides, ca: mean(best.rides.map(sideA)), cb: mean(best.rides.map(sideB)), ink };
    bundles[x.p] = undefined;
    bundles[x.q] = undefined;
    const at = bundles.length;
    bundles.push(fresh);
    for (const { q, flip } of nearOf(fresh, at)) offer(at, q, flip);
  }
  const groups = new Map<string, EdgeGroup>();
  bundles.forEach((b, n) => {
    if (b) for (const r of b.rides) groups.set(plugs[r.i]!.edge.id, { key: `s${n}`, flip: r.flip });
  });
  return groups;
}

/** This function gives the highways of the bundles of `savingsBundles`. Each bundle with `minSize` edges or more gets one trunk through the corner graph. */
export function savingsPlan(input: HighwayInput, o: Readonly<SavingsOptions>): HighwayPlan {
  return groupedPlan(input, savingsBundles(input, o), { spine: "trunk", minSize: o.minSize, ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) });
}
