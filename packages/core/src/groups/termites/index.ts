/**
 * The group strategy `termites` (NAT-010): hubs at the peaks of a deposit, after the nest model of Bonabeau and others (1998).
 * Each straight edge line drops material on a grid. The strong deposits grow and space out, and the hub of each section goes to the strongest peak in its cell.
 */
import type { Box, Point } from "../../geom.ts";
import { blurImage, lineDensity, type DensityImage } from "../../highways/ridges/index.ts";
import { edgePlugs } from "../../highways/stretches.ts";
import type { Graph } from "../../model.ts";
import { buildSections, SECTION_DEFAULTS, type Section, type SectionOptions } from "../../sections.ts";

/** The options of the group strategy `termites` (NAT-010), next to the options of the tree of sections. */
export interface TermiteOptions extends SectionOptions {
  /** The smallest distance between two peaks, in mean node sizes, from 2 to 10. The default is 4. */
  readonly radius?: number;
  /** The number of growth steps, from 10 to 100. The default is 30. */
  readonly steps?: number;
  /** The share of the deposit that fades at each step, from 0.05 to 0.5. The default is 0.2. */
  readonly decay?: number;
  /** The size of a grid cell, in mean node sizes, from 0.5 to 2. The default is 1. */
  readonly cell?: number;
}

/** The default options of the strategy `termites`. */
export const TERMITE_DEFAULTS: Readonly<Required<TermiteOptions>> = Object.freeze({ ...SECTION_DEFAULTS, radius: 4, steps: 30, decay: 0.2, cell: 1 });

/** The largest number of cells on one side of the grid. A larger board gets larger cells. */
const MAX_SIDE = 192;

/** The width of the scent around a deposit, in cells. */
const SCENT = 1;

/** A peak of the deposit: its place and its strength. */
export interface TermitePeak {
  readonly at: Point;
  readonly strength: number;
}

/** This function gives the bounds of the boxes of the graph. */
function boundsOf(graph: Graph): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const n of graph.nodes) {
    x0 = Math.min(x0, n.box.x);
    y0 = Math.min(y0, n.box.y);
    x1 = Math.max(x1, n.box.x + n.box.w);
    y1 = Math.max(y1, n.box.y + n.box.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/**
 * This function grows the deposit `C` of the image (NAT-010, the simple form): `C ← C + C blur(C) - decay C`, with the largest value scaled to 1 after each step.
 * A strong cell gains more than a weak cell, so the weak cells fade between the peaks.
 */
export function growDeposit(image: DensityImage, steps: number, decay: number): Float64Array {
  const { w, h } = image;
  let c = Float64Array.from(image.rho);
  const scale = (v: Float64Array): void => {
    let top = 0;
    for (let i = 0; i < v.length; i++) top = Math.max(top, v[i]!);
    if (top > 0) for (let i = 0; i < v.length; i++) v[i] = v[i]! / top;
  };
  scale(c);
  for (let s = 0; s < Math.max(0, Math.floor(steps)); s++) {
    const scent = blurImage(c, w, h, SCENT);
    const next = new Float64Array(c.length);
    for (let i = 0; i < c.length; i++) next[i] = Math.max(0, c[i]! + c[i]! * scent[i]! - decay * c[i]!);
    scale(next);
    c = next;
  }
  return c;
}

/**
 * This function gives the local maxima of the deposit, the strongest first. A peak has no stronger peak nearer than `radius`.
 * A tie goes to the earlier cell, in the order of the rows.
 */
export function depositPeaks(image: DensityImage, deposit: Float64Array, radius: number): TermitePeak[] {
  const { w, h, cell, x0, y0 } = image;
  const found: { i: number; v: number }[] = [];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const v = deposit[i]!;
      if (v <= 0) continue;
      let top = true;
      for (let dy = -1; dy <= 1 && top; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h || (dx === 0 && dy === 0)) continue;
          if (deposit[ny * w + nx]! > v) {
            top = false;
            break;
          }
        }
      if (top) found.push({ i, v });
    }
  found.sort((p, q) => q.v - p.v || p.i - q.i);
  const peaks: TermitePeak[] = [];
  const limit = radius * radius;
  for (const { i, v } of found) {
    const at = { x: x0 + ((i % w) + 0.5) * cell, y: y0 + (Math.floor(i / w) + 0.5) * cell };
    if (peaks.every((p) => (p.at.x - at.x) ** 2 + (p.at.y - at.y) ** 2 >= limit)) peaks.push({ at, strength: v });
  }
  return peaks;
}

/** This function gives the peaks of the deposit of the straight edge lines of the graph. */
export function termitePeaks(graph: Graph, o: Readonly<Required<Pick<TermiteOptions, "radius" | "steps" | "decay" | "cell">>>): TermitePeak[] {
  if (graph.nodes.length === 0) return [];
  let size = 0;
  for (const n of graph.nodes) size += (n.box.w + n.box.h) / 2;
  const u = Math.max(1, size / graph.nodes.length);
  const bounds = boundsOf(graph);
  const cell = Math.max(o.cell * u, bounds.w / MAX_SIDE, bounds.h / MAX_SIDE, 1e-6);
  const lines = edgePlugs(graph).map(({ ps, pt }) => [ps.point, pt.point]);
  const image = lineDensity(lines, bounds, cell, cell);
  return depositPeaks(image, growDeposit(image, o.steps, o.decay), o.radius * u);
}

/**
 * This function gives the tree of sections of `quadtree`, with a hub for each section of two nodes or more (NAT-010).
 * The hub is the strongest peak in the cell of the section. A section with no peak in its cell keeps the rule of the router.
 */
export function termiteGroups(graph: Graph, options: TermiteOptions = {}): Section {
  const o = { ...TERMITE_DEFAULTS, ...options };
  const peaks = termitePeaks(graph, o);
  const inCell = (c: Box, p: Point): boolean => p.x >= c.x && p.y >= c.y && p.x < c.x + c.w && p.y < c.y + c.h;
  const place = (s: Section): Section => {
    const children = s.children.map(place);
    const peak = s.nodes.length >= 2 ? peaks.find((p) => inCell(s.cell, p.at)) : undefined;
    return peak ? { ...s, children, hub: peak.at } : { ...s, children };
  };
  return place(buildSections(graph.nodes, o));
}
