import type { Edge, Graph, Node, Port, Side } from "../../model.ts";
import { documentHash, round3 } from "./hash.ts";

/** The side of a port in an input file. The router calls the same sides `north`, `east`, `south` and `west`. */
export type LayoutSide = "top" | "right" | "bottom" | "left";

/** A port of a box in an input file. */
export interface LayoutPort {
  readonly id: string;
  /** The side of the box. Without it and without `x` and `y`, the router picks the side. */
  readonly side?: LayoutSide;
  /** The fixed place of the port, from the top-left corner of the box. The router does not move a port with `x` and `y`. */
  readonly x?: number;
  readonly y?: number;
}

/** A point of a region: `[x, y]`. The y axis points down. */
export type RegionPoint = readonly [number, number];

/**
 * An area of the plane. The y axis points down. A ring of a polygon closes itself: its last point joins its first point.
 * A hole of a polygon does not touch the outer ring. The router reads only the bounding box of a region.
 */
export type Region =
  | { readonly kind: "rect"; readonly x: number; readonly y: number; readonly w: number; readonly h: number }
  | { readonly kind: "polygon"; readonly points: readonly RegionPoint[]; readonly holes?: readonly (readonly RegionPoint[])[] }
  | { readonly kind: "circle"; readonly cx: number; readonly cy: number; readonly r: number }
  | { readonly kind: "ellipse"; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number };

/** An area that the boxes and the routes must not use. The router uses the bounding box of its region as a box without edges. */
export interface LayoutObstacle {
  readonly id: string;
  readonly region: Region;
  /** The cost to move the obstacle. Only the packer reads it. */
  readonly move?: { readonly cost: number };
}

/** A box of an input file. */
export interface LayoutBox {
  readonly id: string;
  readonly w: number;
  readonly h: number;
  /** The position of the top-left corner. The packer writes it. The router reads it. */
  readonly x?: number;
  readonly y?: number;
  /** The id of the box that holds this box. */
  readonly parent?: string;
  /** The group of the box. */
  readonly group?: string;
  /** This value is `true` when the box is an obstacle: the packer keeps its `x` and `y`. `false` is the same as no value. The router ignores it. */
  readonly locked?: boolean;
  /** The reading order that the caller wants. The router ignores it. */
  readonly rank?: number;
  readonly ports?: readonly LayoutPort[];
  /** The shape of the box, relative to the top-left corner of the box. The router ignores it and uses `w` and `h` as the bounding box. */
  readonly shape?: Region;
  /** The free data of the node. The grouping rule `keys` reads `data.group`. */
  readonly data?: Readonly<Record<string, unknown>>;
}

/** An edge of an input file. `sourcePort` and `targetPort` name a port of the box at that end. */
export interface LayoutEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly sourcePort?: string;
  readonly targetPort?: string;
  readonly data?: Readonly<Record<string, unknown>>;
}

/** The change of a variant against its base input. */
export type LayoutChange = "add" | "remove" | "resize" | "reorder" | "packed";

/** The origin of an input: `made-up`, `published:<set>` or `known-best:<construction>`. */
export type LayoutSource = "made-up" | `published:${string}` | `known-best:${string}`;

/** The generator of an input. The same name, version, parameters and seed give the same file, byte for byte. */
export interface LayoutGenerator {
  readonly name: string;
  readonly version: number;
  readonly params: Readonly<Record<string, unknown>>;
  readonly seed: number;
}

/**
 * The cell of an input in the taxonomy of the corpus, with one value for each dimension.
 * The packer reads the first six dimensions. The router reads the last four.
 */
export interface LayoutCell {
  readonly containerSize?: "fixed" | "freeHeight" | "freeWidth" | "freeAspect" | "freeArea";
  readonly containerShape?: "rect" | "convex" | "polygon" | "circle" | "ellipse" | "holes";
  readonly obstacles?: "none" | "center" | "scattered" | "wall" | "corridors" | "touching" | "edge";
  readonly sizes?: "identical" | "uniform" | "heavyTail" | "bimodal" | "extremeAspect" | "nearIdentical";
  readonly count?: "1" | "10" | "100" | "1k" | "10k";
  readonly mode?: "offline" | "online" | "incremental";
  readonly edgeDensity?: "sparse" | "medium" | "dense";
  readonly edgeShape?: "random" | "clustered" | "hubChain" | "longRange" | "tree" | "bundled";
  readonly groups?: "none" | "flat" | "nested";
  readonly ports?: "free" | "sides" | "fixed";
}

/** The outer rectangle of a packing. The router ignores it. */
export interface LayoutContainer {
  readonly w?: number;
  readonly h?: number;
  /** `none`: the packer picks the size. `width`: the width stays. `height`: the height stays. `size`: the width and the height stay. */
  readonly fixed: "none" | "width" | "height" | "size";
  /** The ratio `w / h` that the packer aims for. */
  readonly aspect?: number;
  /** The shape of the container. */
  readonly shape?: Region;
}

/** The identity of an input in a set: the set, the family, the seed, and the base of a variant. */
export interface LayoutInputHead {
  /** The id: `<set>/<family>/s<seed>`. */
  readonly id: string;
  readonly set: string;
  readonly family: string;
  readonly seed: number;
  /** The id of the base input of a variant. The stability measures compare the run on the variant with the run on its base. */
  readonly base?: string;
  readonly change?: LayoutChange;
  /** The place of the input in a change sequence. */
  readonly step?: number;
  /** The generator of the input. The default is `null`: a hand-made input. */
  readonly generator?: LayoutGenerator | null;
  /** The origin of the input. The default is `made-up`. */
  readonly source?: LayoutSource;
  readonly cell?: LayoutCell;
}

/**
 * An input file of the form `layout-input/1`. The packer and the router read the same files.
 * The file `docs/LAYOUT-RECORDS.md` gives the form. The repository `packing` keeps a twin of that document.
 */
export interface LayoutInput extends LayoutInputHead {
  readonly schema: "layout-input/1";
  /** The origin of the input. The data of this repository is made-up, because the repository is public. */
  readonly source: LayoutSource;
  /** The generator of the input, or `null` for a hand-made input. */
  readonly generator: LayoutGenerator | null;
  /** The first 16 hex characters of the SHA-256 of the canonical file without this field. `documentHash` calculates it. */
  readonly hash: string;
  readonly container?: LayoutContainer;
  /** The space between two boxes. The router ignores it. */
  readonly gap?: number;
  /** The areas that the boxes and the routes must not use. */
  readonly obstacles?: readonly LayoutObstacle[];
  readonly boxes: readonly LayoutBox[];
  readonly edges: readonly LayoutEdge[];
}

/** One run of one strategy on one input and one seed: a line of the form `layout-record/1`. */
export interface LayoutRecord {
  readonly schema: "layout-record/1";
  /** `pack`, `route` or `joint`. The screen of this package writes `route`. */
  readonly stage: "pack" | "route" | "joint";
  readonly step: string;
  readonly strategy: string;
  /** The options of the run: the defaults of the strategy with the options of the caller. A function is the text `function:<name>`. */
  readonly options: Readonly<Record<string, unknown>>;
  /** The corpus version, for example `screen-v1`. */
  readonly corpus: string;
  /** The id of the input. */
  readonly input: string;
  /** The `hash` of the input file. */
  readonly inputHash: string;
  readonly set: string;
  readonly seed: number;
  readonly nodes: number;
  readonly edges: number;
  /** The measures, by the names of `MEASURES`. A measure without a finite value is not in the record. */
  readonly measures: Readonly<Record<string, number>>;
  /** The count of the breaks of each hard rule. A good run has 0 for each rule. */
  readonly hard: Readonly<Record<string, number>>;
  /** The tolerance of each hard rule of the run, for example `{ through: 0.5 }`. */
  readonly tolerance?: Readonly<Record<string, number>>;
  /** This value is `true` when two runs on the same input give the same output. */
  readonly deterministic: boolean;
  /** The id of the prediction of this run, from the predictions file. */
  readonly prediction?: string;
  /** The time of the run, in milliseconds. Only the times of CI compare. */
  readonly ms: number;
  /** The commit of the code that made the record. */
  readonly commit?: string;
  /** The reason when the strategy did not run, for example an input over its `maxNodes`. Then the record has no measures. */
  readonly skipped?: string;
  /**
   * The first 16 hex characters of the SHA-256 of the output in the highways form (ACTIVATION). `resultHash` gives it for a router.
   * Two records with the same hash have the same output, at the precision `RECORD_EPS`.
   */
  readonly outputHash?: string;
  /** The facts of the stages of the run. The trace measures `move.<name>` count the own move of the strategy (ACTIVATION). */
  readonly trace?: readonly RecordTrace[];
}

/** The facts of one stage of a run, as the `StageTrace` of the contract: its id, its time and its trace measures. */
export interface RecordTrace {
  readonly id: string;
  readonly ms?: number;
  readonly measures?: Readonly<Record<string, number>>;
}

/** The comparison of a prediction. Without it, `<=` applies to a measure where lower is better, and `>=` to the other measures. */
export type PredictionOp = "<" | "<=" | "=" | ">=" | ">";

/** A prediction about a run: one line of a predictions file. A commit adds the file before the run starts. */
export interface LayoutPrediction {
  readonly schema?: "layout-prediction/1";
  readonly id: string;
  readonly strategy: string;
  readonly set: string;
  /** The id of one input. Without it, the prediction is about the median of the measure over the set. */
  readonly input?: string;
  /** The name of the measure, from `MEASURES`. */
  readonly measure: string;
  readonly expected: number;
  readonly op?: PredictionOp;
  readonly reason: string;
}

const TO_FILE: Readonly<Record<Side, LayoutSide>> = { north: "top", east: "right", south: "bottom", west: "left" };
const TO_MODEL: Readonly<Record<LayoutSide, Side>> = { top: "north", right: "east", bottom: "south", left: "west" };

/** This function gives the side of a box that holds a point, relative to the top-left corner of the box. */
function sideAt(p: { x: number; y: number }, w: number, h: number): LayoutSide {
  const d: [LayoutSide, number][] = [
    ["top", Math.abs(p.y)],
    ["right", Math.abs(w - p.x)],
    ["bottom", Math.abs(h - p.y)],
    ["left", Math.abs(p.x)],
  ];
  return d.reduce((a, b) => (b[1] < a[1] ? b : a))[0];
}

/** This function gives 0 for -0, because JSON writes -0 as 0. Then a file and the graph that it comes from hold the same numbers. */
const num = round3;

function portToFile(p: Port, n: Node): LayoutPort {
  const side = p.side ? TO_FILE[p.side] : p.at ? sideAt(p.at, n.box.w, n.box.h) : undefined;
  return { id: p.id, ...(side ? { side } : {}), ...(p.at ? { x: num(p.at.x), y: num(p.at.y) } : {}) };
}

function portToModel(p: LayoutPort): Port {
  if (p.x !== undefined && p.y !== undefined) return { id: p.id, at: { x: p.x, y: p.y } };
  return { id: p.id, ...(p.side ? { side: TO_MODEL[p.side] } : {}) };
}

/**
 * This function writes a graph as an input file of the form `layout-input/1`, with its hash.
 * A fixed plug gets `x`, `y` and the side that holds it. `inputGraph` reads the file back.
 */
export function graphInput(graph: Graph, head: LayoutInputHead): LayoutInput {
  const boxes = graph.nodes.map(
    (n): LayoutBox => ({
      id: n.id,
      w: num(n.box.w),
      h: num(n.box.h),
      x: num(n.box.x),
      y: num(n.box.y),
      ...(n.ports ? { ports: n.ports.map((p) => portToFile(p, n)) } : {}),
      ...(n.data ? { data: n.data } : {}),
    }),
  );
  const edges = graph.edges.map(
    (e): LayoutEdge => ({
      id: e.id,
      source: e.source.node,
      target: e.target.node,
      ...(e.source.port !== undefined ? { sourcePort: e.source.port } : {}),
      ...(e.target.port !== undefined ? { targetPort: e.target.port } : {}),
      ...(e.data ? { data: e.data } : {}),
    }),
  );
  const body = {
    schema: "layout-input/1" as const,
    id: head.id,
    set: head.set,
    family: head.family,
    seed: head.seed,
    ...(head.base !== undefined ? { base: head.base } : {}),
    ...(head.change !== undefined ? { change: head.change } : {}),
    ...(head.step !== undefined ? { step: head.step } : {}),
    source: head.source ?? "made-up",
    generator: head.generator ?? null,
    ...(head.cell !== undefined ? { cell: head.cell } : {}),
    boxes,
    edges,
  };
  return { ...body, hash: documentHash(body) };
}

/**
 * This function gives the bounding box of a region: the smallest box that holds it.
 */
export function regionBounds(region: Region): { x: number; y: number; w: number; h: number } {
  if (region.kind === "rect") return { x: region.x, y: region.y, w: region.w, h: region.h };
  if (region.kind === "circle") return { x: region.cx - region.r, y: region.cy - region.r, w: 2 * region.r, h: 2 * region.r };
  if (region.kind === "ellipse") return { x: region.cx - region.rx, y: region.cy - region.ry, w: 2 * region.rx, h: 2 * region.ry };
  const xs = region.points.map((p) => p[0]);
  const ys = region.points.map((p) => p[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/**
 * The fields of an input that `inputGraph` reads. A contract input, for example the result of `applyPack`, has these fields.
 * Without `edges`, the input has no edges.
 */
export type RouteInput = Pick<LayoutInput, "id" | "boxes" | "obstacles"> & { readonly edges?: LayoutInput["edges"] };

/**
 * This function reads the graph of the router from an input file. The router reads the positions, the ports, the edges and the data.
 * Each obstacle becomes a node without edges, with the bounding box of its region, after the boxes.
 * The router ignores the other fields of the packer: `container`, `gap`, `locked`, `rank`, the `shape` of a box and the `move` of an obstacle.
 * A box without `x` and `y` is an error.
 */
export function inputGraph(input: RouteInput): Graph {
  const nodes = input.boxes.map((b): Node => {
    if (b.x === undefined || b.y === undefined) throw new Error(`The box "${b.id}" of the input "${input.id}" has no position. The router needs a placed input.`);
    return { id: b.id, box: { x: b.x, y: b.y, w: b.w, h: b.h }, ...(b.ports ? { ports: b.ports.map(portToModel) } : {}), ...(b.data ? { data: b.data } : {}) };
  });
  for (const o of input.obstacles ?? []) nodes.push({ id: o.id, box: regionBounds(o.region) });
  const edges = (input.edges ?? []).map(
    (e): Edge => ({
      id: e.id,
      source: { node: e.source, ...(e.sourcePort !== undefined ? { port: e.sourcePort } : {}) },
      target: { node: e.target, ...(e.targetPort !== undefined ? { port: e.targetPort } : {}) },
      ...(e.data ? { data: e.data } : {}),
    }),
  );
  return { nodes, edges };
}

/**
 * This function writes an input file as text: the keys in sorted order, and one box or one edge on each line.
 * `JSON.parse` of the text gives the input again.
 */
export function formatInput(input: LayoutInput): string {
  const o = input as unknown as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  const lines = keys.map((k) => {
    const v = o[k];
    if (Array.isArray(v)) return `  ${JSON.stringify(k)}: [${v.length === 0 ? "]" : `\n${v.map((x) => `    ${canonical(x)}`).join(",\n")}\n  ]`}`;
    return `  ${JSON.stringify(k)}: ${canonical(v)}`;
  });
  return `{\n${lines.join(",\n")}\n}\n`;
}

/** This function writes a value as canonical JSON with a space after each colon and comma, for a line of a file. */
function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonical).join(", ")}]`;
  const o = value as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}: ${canonical(o[k])}`).join(", ")}}`;
}

/** This function writes records as JSON Lines: one record on each line. */
export function recordLines(records: readonly LayoutRecord[]): string {
  return records.map((r) => JSON.stringify(r) + "\n").join("");
}

/** This function reads JSON Lines. It ignores an empty line. */
export function parseLines<T>(text: string): T[] {
  return text
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as T);
}

/**
 * This function gives a copy of a value that JSON keeps.
 * A function becomes the text `function:<name>`, and a number that is not finite becomes its text.
 */
export function jsonSafe(value: unknown): unknown {
  if (typeof value === "function") return `function:${(value as { name?: string }).name || "anonymous"}`;
  if (typeof value === "number") return Number.isFinite(value) ? value : String(value);
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value instanceof Set) return [...value].map(jsonSafe);
  if (value instanceof Map) return Object.fromEntries([...value].map(([k, v]) => [String(k), jsonSafe(v)]));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = jsonSafe(v);
  return out;
}
