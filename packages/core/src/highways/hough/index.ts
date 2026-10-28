import { dist, type Point } from "../../geom.ts";
import type { WayOptions } from "../../ways.ts";
import type { HighwayInput, HighwayPlan } from "../model.ts";
import { linePoint, snapPlan, type SnapLine } from "../snap.ts";
import { edgePlugs } from "../stretches.ts";

/** The options of the highway strategy `hough` (HWY-024 of the note on highways). */
export interface HoughOptions extends Pick<WayOptions, "margin" | "k"> {
  /** The width of the votes in the angle, in degrees. An edge joins a peak within this angle. The default is 8. */
  readonly dTheta: number;
  /** The width of the votes in the offset, in units of the board. An edge joins a peak when its middle is this near to the line. The default is 12. */
  readonly dRho: number;
  /** A peak with fewer edges than this number is not a corridor. The default is 3. */
  readonly minVotes: number;
  /** With `true`, the peaks are only horizontal or vertical lines. The default is `false`. */
  readonly orthogonal: boolean;
}

/** The default options of the strategy `hough`. */
export const HOUGH_DEFAULTS: Readonly<Required<Omit<HoughOptions, "margin" | "k">>> = Object.freeze({ dTheta: 8, dRho: 12, minVotes: 3, orthogonal: false });

/** The line of one edge: its direction angle from 0 to pi, its offset along the normal, its middle and its ends. */
interface EdgeLine {
  readonly edge: string;
  readonly theta: number;
  readonly s: Point;
  readonly t: Point;
  readonly mid: Point;
  readonly len: number;
}

/** A peak of the votes: its angle, its offset and the sum of its votes. */
export interface HoughPeak {
  readonly theta: number;
  readonly rho: number;
  readonly votes: number;
}

const DEG = Math.PI / 180;

/** This function gives the offset of a point from the line through the origin with the direction angle `theta`. */
const offsetOf = (p: Point, theta: number): number => -p.x * Math.sin(theta) + p.y * Math.cos(theta);

/** This function gives the place of a point along the direction angle `theta`. */
const placeOf = (p: Point, theta: number): number => p.x * Math.cos(theta) + p.y * Math.sin(theta);

/** This function gives the difference of two direction angles, from 0 to pi / 2. */
function angleGap(a: number, b: number): number {
  const d = Math.abs(a - b) % Math.PI;
  return Math.min(d, Math.PI - d);
}

/**
 * This function gives the peaks of the votes of the lines (Duda and Hart 1972). Each line votes for its angle and its offset, with a weight of its length.
 * A vote spreads as a Gaussian with the widths `dTheta / 2` and `dRho / 2`. The accumulator has bins of 1 degree and of `dRho / 4`.
 * A peak is a bin with a larger sum than each other bin within `dTheta` and `dRho`. The peaks come in the order of their votes.
 */
export function houghPeaks(lines: readonly { theta: number; mid: Point; len: number }[], o: Readonly<Pick<HoughOptions, "dTheta" | "dRho" | "orthogonal">>): HoughPeak[] {
  if (lines.length === 0) return [];
  const thetas = o.orthogonal ? [0, 90] : Array.from({ length: 180 }, (_, i) => i);
  const T = thetas.length;
  const rhoStep = Math.max(1e-6, o.dRho / 4);
  let maxRho = 0;
  for (const l of lines) maxRho = Math.max(maxRho, Math.abs(l.mid.x) + Math.abs(l.mid.y));
  const R = Math.ceil(maxRho / rhoStep) + 4;
  const rows = 2 * R + 1;
  const acc = new Float64Array(T * rows);
  const wTheta = Math.max(1e-6, o.dTheta);
  const sT = wTheta / 2;
  const sR = o.dRho / 2;
  const reachR = Math.ceil(o.dRho / rhoStep);
  for (const l of lines) {
    for (let ti = 0; ti < T; ti++) {
      const gap = angleGap(thetas[ti]! * DEG, l.theta) / DEG;
      if (gap > wTheta) continue;
      const rho = offsetOf(l.mid, thetas[ti]! * DEG);
      const center = Math.round(rho / rhoStep);
      const wt = Math.exp(-(gap * gap) / (2 * sT * sT)) * l.len;
      for (let r = center - reachR; r <= center + reachR; r++) {
        if (r < -R || r > R) continue;
        const dr = r * rhoStep - rho;
        acc[ti * rows + r + R] = acc[ti * rows + r + R]! + wt * Math.exp(-(dr * dr) / (2 * sR * sR));
      }
    }
  }
  const reachT = o.orthogonal ? 0 : Math.ceil(wTheta);
  const peaks: HoughPeak[] = [];
  for (let ti = 0; ti < T; ti++)
    for (let r = 0; r < rows; r++) {
      const v = acc[ti * rows + r]!;
      if (v <= 0) continue;
      let top = true;
      for (let dt = -reachT; dt <= reachT && top; dt++)
        for (let dr = -reachR; dr <= reachR && top; dr++) {
          if (dt === 0 && dr === 0) continue;
          let tj = ti + dt;
          let rj = r - R;
          // The angle wraps at 180 degrees, and the offset changes its sign there.
          if (tj < 0) [tj, rj] = [tj + T, -rj];
          else if (tj >= T) [tj, rj] = [tj - T, -rj];
          rj += dr;
          if (rj < -R || rj > R) continue;
          const w = acc[tj * rows + rj + R]!;
          // A tie goes to the first bin in the order of the accumulator.
          if (w > v || (w === v && tj * rows + rj + R < ti * rows + r)) top = false;
        }
      if (top) peaks.push({ theta: thetas[ti]! * DEG, rho: (r - R) * rhoStep, votes: v });
    }
  peaks.sort((a, b) => b.votes - a.votes || a.theta - b.theta || a.rho - b.rho);
  return peaks;
}

/**
 * This function gives the corridors of the votes (HWY-024). Each edge joins the first peak with an angle within `dTheta` and its middle within `dRho` of the line.
 * The corridor runs over the common span of the projections of its edges on the line. Each edge snaps to the ends of that span.
 * A member that makes the span shorter than four margins leaves, while the peak keeps `minVotes` edges.
 */
export function houghLines(input: HighwayInput, o: Readonly<HoughOptions>): SnapLine[] {
  const margin = o.margin ?? 5;
  const lines: EdgeLine[] = [];
  for (const { edge, ps, pt } of edgePlugs(input.graph)) {
    const s = ps.point;
    const t = pt.point;
    const len = dist(s, t);
    if (len <= 1e-9) continue;
    const theta = (((Math.atan2(t.y - s.y, t.x - s.x) % Math.PI) + Math.PI) % Math.PI);
    lines.push({ edge: edge.id, theta, s, t, mid: { x: (s.x + t.x) / 2, y: (s.y + t.y) / 2 }, len });
  }
  const peaks = houghPeaks(lines, o);
  const taken = new Set<string>();
  const out: SnapLine[] = [];
  const need = Math.max(2, Math.round(o.minVotes));
  for (const [pi, p] of peaks.entries()) {
    let members = lines.filter((l) => !taken.has(l.edge) && angleGap(l.theta, p.theta) <= o.dTheta * DEG && Math.abs(offsetOf(l.mid, p.theta) - p.rho) <= o.dRho);
    const span = (list: readonly EdgeLine[]): [number, number] => {
      let lo = -Infinity;
      let hi = Infinity;
      for (const l of list) {
        const a = placeOf(l.s, p.theta);
        const b = placeOf(l.t, p.theta);
        lo = Math.max(lo, Math.min(a, b));
        hi = Math.min(hi, Math.max(a, b));
      }
      return [lo, hi];
    };
    let [lo, hi] = span(members);
    while (members.length >= need && hi - lo < 4 * margin) {
      // The member that limits the span the most leaves.
      let best = -1;
      let gain = -Infinity;
      members.forEach((_, i) => {
        const [l2, h2] = span(members.filter((__, j) => j !== i));
        if (h2 - l2 > gain) [gain, best] = [h2 - l2, i];
      });
      members = members.filter((_, j) => j !== best);
      [lo, hi] = span(members);
    }
    if (members.length < need || hi - lo < 4 * margin) continue;
    for (const l of members) taken.add(l.edge);
    const a = linePoint(p.theta, p.rho, lo);
    const b = linePoint(p.theta, p.rho, hi);
    out.push({
      key: `p${pi}`,
      a,
      b,
      members: members.map((l) => {
        const forward = placeOf(l.s, p.theta) <= placeOf(l.t, p.theta);
        return { edge: l.edge, from: forward ? a : b, to: forward ? b : a, at: 0 };
      }),
    });
  }
  return out;
}

/**
 * This function gives the highways of the Hough votes (HWY-024). The peaks of the votes of the straight lines of the edges are corridors.
 * Each corridor is a spine through the corner graph, and its edges ride it over their common span.
 */
export function houghPlan(input: HighwayInput, o: Readonly<HoughOptions>): HighwayPlan {
  const way = { ...(o.margin === undefined ? {} : { margin: o.margin }), ...(o.k === undefined ? {} : { k: o.k }) };
  return snapPlan(input, houghLines(input, o), { ...way, minSize: Math.max(2, Math.round(o.minVotes)) });
}
