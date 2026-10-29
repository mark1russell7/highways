import { cornersRouter, runKey, sectionsRouter, segmentsOf, type Graph, type InnerMode, type Point, type Result, type SegmentGraph } from "@mark1russell7/highways";
import coursesText from "../content/examples/courses.md?raw";
import deliveryText from "../content/examples/delivery.md?raw";
import howtoText from "../content/examples/howto.md?raw";
import introText from "../content/examples/intro.md?raw";
import ordersText from "../content/examples/orders.md?raw";
import servicesText from "../content/examples/services.md?raw";
import { EXAMPLE_BOARDS, type Board } from "./boards.ts";
import { html, sectionOf } from "./content.ts";
import { genPanel } from "./gen-controls.ts";
import { cleanGen, genFamily, NAMED_GENS, readGen, START_GEN, writeGen, type GenSpec } from "./generated.ts";
import type { RouteReply, RouteRequest } from "./protocol.ts";
import "./style.css";
import { MapView, type Routed } from "./view.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no element "${id}".`);
  return el as T;
};

const fmt = new Intl.NumberFormat("en-US");
const TEXT: Readonly<Record<string, string>> = { delivery: deliveryText, services: servicesText, courses: coursesText, orders: ordersText };

/** The space between a road and a card. This margin puts the roads in the middle of the free space between two cards. */
const MARGIN = 20;

/** The router of the boards. */
const router = sectionsRouter({ name: "sections", margin: MARGIN, stretch: 3, cap: 6 });

/**
 * The routers of the inner edges of a card with rows (INTERIOR-ROUTE), one for each mode of the option `inner`.
 * The router `sections` gives no route for an inner edge.
 */
const inners: Readonly<Record<InnerMode, ReturnType<typeof cornersRouter>>> = {
  corners: cornersRouter({ name: "corners", margin: 6 }),
  gutter: cornersRouter({ name: "corners", margin: 6, inner: "gutter" }),
};

/** This function tells if a board has frames: nodes that hold other nodes. */
const hasFrames = (graph: Graph): boolean => graph.nodes.some((n) => n.parent !== undefined);

/** This function routes a board: the outer edges with `sections`, then the inner edges of each frame with `corners` in the mode `mode`. */
function routeBoard(graph: Graph, mode: InnerMode): Result {
  const outer = router.route(graph);
  if (!hasFrames(graph)) return outer;
  return { ...outer, routes: [...outer.routes, ...inners[mode].route(graph).routes.filter((r) => r.frame !== undefined)] };
}

/** The mode of the inner routes on the page. The buttons "Corners" and "Gutters" change it. */
let innerMode: InnerMode = "corners";

/** The id of the tab of the generated board (CORPUS-GEN). */
const GENERATED = "generated";

/** The pick of the worker for a generated board: the default pipeline, the whole strategy `pipeline` with the router `corners`. */
const DEFAULT_PICK = { router: "corners" } as const;

/** A routed board: the board, its routes and the key of each shared run. */
interface Shown {
  readonly board: Board;
  readonly done: Routed & { readonly segments: SegmentGraph };
  readonly runs: readonly string[];
  readonly ms: number;
  /** The first view: on a small screen, the map starts near the focus card, large enough to show the routes. */
  readonly home: { readonly minScale: number; readonly focus?: Point };
}

const boards = EXAMPLE_BOARDS.map((make) => make());
const shown = new Map<string, Shown>();

/** This function gives the shown form of a routed board. */
function shownOf(board: Board, done: Shown["done"], ms: number): Shown {
  const runs = [...new Set(done.segments.segments.filter((x) => x.count > 1).map((x) => runKey(x.edges)))];
  const widths = board.graph.nodes.map((n) => n.box.w).sort((a, b) => a - b);
  const box = board.graph.nodes.find((n) => n.id === board.focus)?.box;
  const focus = box && { x: box.x + box.w / 2, y: box.y + box.h / 2 };
  return { board, done, runs, ms, home: { minScale: 60 / (widths[widths.length >> 1] ?? 60), ...(focus && { focus }) } };
}

/** This function routes a board one time for each mode of the inner routes, and keeps the result. */
function routed(board: Board): Shown {
  const mode = hasFrames(board.graph) ? innerMode : "corners";
  const key = `${board.id} ${mode}`;
  let s = shown.get(key);
  if (!s) {
    const t0 = performance.now();
    const result = routeBoard(board.graph, mode);
    const segments = segmentsOf(result);
    s = shownOf(board, { result, segments }, performance.now() - t0);
    shown.set(key, s);
  }
  return s;
}

/** This function gives the board form of a generated graph: no cards, and the name of its family. */
function genBoard(spec: GenSpec, graph: Graph): Board {
  return { id: GENERATED, name: `Generated: ${spec.family}`, noun: "nodes", edgeNoun: "edges", graph, cards: new Map(), focus: "" };
}

interface State {
  board: string;
  gen: GenSpec;
  open: ReadonlySet<string>;
  selected: string | undefined;
}

/** This function reads the hash: `#<board id>` for a board of made-up data, or `#family=...&seed=...&<dimension>=...` for a generated board. */
const fromHash = (): { readonly board: string; readonly gen?: GenSpec } => {
  const text = location.hash.slice(1);
  const gen = text.includes("=") ? readGen(new URLSearchParams(text)) : undefined;
  if (gen) return { board: GENERATED, gen };
  if (text === GENERATED) return { board: GENERATED };
  return { board: boards.some((b) => b.id === text) ? text : boards[0]!.id };
};

const first = fromHash();
const state: State = { board: first.board, gen: first.gen ?? START_GEN, open: new Set(), selected: undefined };

/** The generated board on the map, when its route is back from the worker. */
let genShown: { readonly key: string; readonly shown: Shown } | undefined;
const genKey = (spec: GenSpec): string => writeGen(spec).toString();
const current = (): Shown | undefined =>
  state.board === GENERATED ? (genShown?.key === genKey(state.gen) ? genShown.shown : undefined) : routed(boards.find((b) => b.id === state.board)!);

// The worker generates and routes each generated board, so the page stays responsive on a large board.
const worker = new Worker(new URL("./route.worker.ts", import.meta.url), { type: "module" });
let lastId = 0;
worker.addEventListener("message", (e: MessageEvent<RouteReply>) => {
  const reply = e.data;
  if (reply.id !== lastId) return;
  if (!reply.ok) {
    $("gen-status").textContent = `This board did not route: ${reply.error}`;
    return;
  }
  const segments = reply.segments ?? segmentsOf(reply.result);
  genShown = { key: genKey(state.gen), shown: shownOf(genBoard(state.gen, reply.graph!), { result: reply.result, segments }, reply.ms) };
  if (state.board === GENERATED) {
    boardText();
    render();
  }
});

/** This function asks the worker for the generated board of the state. */
function generate(): void {
  if (genShown?.key === genKey(state.gen)) return;
  const req: RouteRequest = { id: ++lastId, fixture: "", pick: DEFAULT_PICK, gen: state.gen };
  $("gen-status").textContent = "Generating and routing…";
  worker.postMessage(req);
}

const view = new MapView(
  $("map"),
  (node) => {
    state.selected = node === state.selected ? undefined : node;
    render();
  },
  (level) => showLevel(level),
  (key) => {
    // A new set each time, so the view sees the change.
    const open = new Set(state.open);
    if (open.has(key)) open.delete(key);
    else open.add(key);
    state.open = open;
    render();
  },
);

$("intro").innerHTML = html(introText);
$("howto-body").innerHTML = html(howtoText);

const row = $("boards");
const tabs = [...boards.map((b) => ({ id: b.id, name: b.name })), { id: GENERATED, name: "Generator" }];
for (const b of tabs) {
  const button = document.createElement("button");
  button.type = "button";
  button.role = "tab";
  button.className = "exit";
  button.dataset["board"] = b.id;
  button.setAttribute("aria-controls", "map");
  button.textContent = b.name;
  button.addEventListener("click", () => pick(b.id));
  row.append(button);
}
row.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const i = tabs.findIndex((b) => b.id === state.board);
  const j = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
  pick(tabs[j]!.id);
  row.querySelector<HTMLButtonElement>(`[data-board="${tabs[j]!.id}"]`)?.focus();
  e.preventDefault();
});

$("zoom-in").addEventListener("click", () => view.zoomBy(1.6));
$("zoom-out").addEventListener("click", () => view.zoomBy(1 / 1.6));
$("zoom-fit").addEventListener("click", () => view.fit());
$("open-all").addEventListener("click", () => {
  state.open = new Set(current()?.runs ?? []);
  render();
});
$("close-all").addEventListener("click", () => {
  state.open = new Set();
  render();
});
for (const b of document.querySelectorAll<HTMLButtonElement>("#inner-mode [data-inner]")) {
  b.addEventListener("click", () => {
    innerMode = b.dataset["inner"] as InnerMode;
    for (const o of document.querySelectorAll<HTMLButtonElement>("#inner-mode [data-inner]")) o.setAttribute("aria-checked", String(o === b));
    state.open = new Set();
    render();
  });
}
addEventListener("hashchange", () => {
  const next = fromHash();
  if (next.board !== state.board) pick(next.board, next.gen);
  else if (next.gen && genKey(next.gen) !== genKey(state.gen)) setGen(next.gen);
});

/** This function writes the hash of the state. */
function writeHash(): void {
  const hash = state.board === GENERATED ? writeGen(state.gen).toString() : state.board;
  if (location.hash.slice(1) !== hash) history.replaceState(null, "", `#${hash}`);
}

/** This function shows another board. */
function pick(id: string, gen?: GenSpec): void {
  if (!tabs.some((b) => b.id === id)) return;
  state.board = id;
  if (gen) state.gen = cleanGen(gen);
  state.open = new Set();
  state.selected = undefined;
  writeHash();
  if (id === GENERATED) {
    genControls();
    generate();
  }
  boardText();
  render();
}

/** This function shows another generated board: new controls, a new hash and a new route from the worker. */
function setGen(spec: GenSpec): void {
  state.gen = cleanGen(spec);
  state.open = new Set();
  state.selected = undefined;
  writeHash();
  genControls();
  generate();
  boardText();
  render();
}

/** This function builds the panel of the generator: the named examples, then the controls of the family. */
function genControls(): void {
  const named = $("gen-named");
  named.replaceChildren();
  const key = genKey(state.gen);
  for (const n of NAMED_GENS) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.className = "link";
    b.textContent = n.name;
    b.setAttribute("aria-pressed", String(genKey(n.spec) === key));
    b.addEventListener("click", () => setGen(n.spec));
    li.append(b);
    named.append(li);
  }
  $("gen-controls").replaceChildren(genPanel("ex", state.gen, setGen));
}

/** This function writes the text of the board: its name, its lead and the steps to try. */
function boardText(): void {
  const gen = state.board === GENERATED;
  const board = gen ? undefined : boards.find((b) => b.id === state.board)!;
  const name = board?.name ?? `Generated: ${state.gen.family}`;
  const text = board ? (TEXT[board.id] ?? "") : "";
  const lede = board ? text.split(/\r?\n## /)[0]!.trim() : (genFamily(state.gen.family)?.meaning ?? "");
  $("board-title").textContent = name;
  $("board-lede").innerHTML = html(lede);
  $("board-try").innerHTML = board ? `<h3>Try this</h3>${html(sectionOf(text, "Try this"))}` : "";
  $("board-try").hidden = gen;
  $("inner-mode").hidden = !board || !hasFrames(board.graph);
  $("gen").hidden = !gen;
  $("map").setAttribute("aria-label", `The map of the ${name.toLowerCase()}`);
  document.title = `${name}: highways examples`;
  for (const b of row.querySelectorAll<HTMLButtonElement>(".exit")) {
    const on = b.dataset["board"] === state.board;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  }
}

function render(): void {
  const s = current();
  if (!s) return;
  if (state.board === GENERATED) $("gen-status").textContent = "";
  const { board } = s;
  view.set({
    graph: board.graph,
    done: s.done,
    bundles: "unpack",
    level: "auto",
    selected: state.selected,
    open: state.open,
    ...(board.cards.size > 0 ? { cards: board.cards } : {}),
    noun: board.noun,
    // A card shows its routes when it is about 52 pixels wide. Its title is easy to read at that size.
    pick: { routesAt: 52, itemAt: 120 },
    // The links of a level keep half the margin from the groups. A smaller pad keeps the outlines clear of the links.
    groupPad: MARGIN / 2 - 2,
    home: s.home,
  });
  const openAll = $<HTMLButtonElement>("open-all");
  const closeAll = $<HTMLButtonElement>("close-all");
  openAll.disabled = state.open.size >= s.runs.length;
  closeAll.disabled = state.open.size === 0;
  facts(s);
}

function facts(s: Shown): void {
  const { board, done } = s;
  const levels = done.result.levels?.length ?? 0;
  const rows: [string, string][] = [
    ["Board", `${fmt.format(board.graph.nodes.length)} ${board.noun}, ${fmt.format(board.graph.edges.length)} ${board.edgeNoun}`],
    ["Runs", `${fmt.format(s.runs.length)} shared runs, ${fmt.format(state.open.size)} open`],
    ["Zoom", `${fmt.format(levels)} levels, then each route`],
    ["Time", `${s.ms < 10 ? s.ms.toFixed(1) : fmt.format(Math.round(s.ms))} ms to route on this device`],
  ];
  const dl = $("facts");
  dl.replaceChildren();
  for (const [k, v] of rows) {
    const div = document.createElement("div");
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = k;
    dd.textContent = v;
    div.append(dt, dd);
    dl.append(div);
  }
  if (state.selected) {
    const card = board.cards.get(state.selected);
    const n = board.graph.edges.filter((e) => e.source.node === state.selected || e.target.node === state.selected).length;
    const div = document.createElement("div");
    div.className = "picked";
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = "Selected";
    dd.textContent = `${card?.title ?? state.selected}, ${n} ${board.edgeNoun} `;
    const clear = document.createElement("button");
    clear.type = "button";
    clear.className = "link";
    clear.textContent = "Clear";
    clear.addEventListener("click", () => {
      state.selected = undefined;
      render();
    });
    dd.append(clear);
    div.append(dt, dd);
    dl.append(div);
  }
}

function showLevel(level: number): void {
  const levels = current()?.done.result.levels ?? [];
  const badge = $("level-badge");
  const near = level >= levels.length;
  const groups = near ? 0 : levels[level]!.items.filter((i) => i.nodes.length > 1).length;
  badge.textContent = near ? "Near: each route" : `Far: ${fmt.format(groups)} ${groups === 1 ? "group" : "groups"}, zoom in for routes`;
  badge.classList.toggle("far", !near);
  badge.hidden = false;
}

if (state.board === GENERATED) {
  writeHash();
  genControls();
  generate();
}
boardText();
render();
