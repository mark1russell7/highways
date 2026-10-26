import { runKey, sectionsRouter, segmentsOf, type Point, type SegmentGraph } from "@mark1russell7/highways";
import coursesText from "../content/examples/courses.md?raw";
import deliveryText from "../content/examples/delivery.md?raw";
import howtoText from "../content/examples/howto.md?raw";
import introText from "../content/examples/intro.md?raw";
import servicesText from "../content/examples/services.md?raw";
import { BOARDS, GAP, type Board } from "./boards.ts";
import { html, sectionOf } from "./content.ts";
import "./style.css";
import { MapView, type Routed } from "./view.ts";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no element "${id}".`);
  return el as T;
};

const fmt = new Intl.NumberFormat("en-US");
const TEXT: Readonly<Record<string, string>> = { delivery: deliveryText, services: servicesText, courses: coursesText };

/** The router of the boards. The margin puts the roads in the middle of the free space between two cards. */
const router = sectionsRouter({ name: "sections", margin: 20, stretch: 3, cap: 6 });

/** A routed board: the board, its routes and the key of each shared run. */
interface Shown {
  readonly board: Board;
  readonly done: Routed & { readonly segments: SegmentGraph };
  readonly runs: readonly string[];
  readonly ms: number;
  /** The first view: on a small screen, the map starts near the focus card, large enough to show the routes. */
  readonly home: { readonly minScale: number; readonly focus?: Point };
}

const boards = BOARDS.map((make) => make());
const shown = new Map<string, Shown>();

/** This function routes a board one time, and keeps the result. */
function routed(board: Board): Shown {
  let s = shown.get(board.id);
  if (!s) {
    const t0 = performance.now();
    const result = router.route(board.graph);
    const segments = segmentsOf(result);
    const ms = performance.now() - t0;
    const runs = [...new Set(segments.segments.filter((x) => x.count > 1).map((x) => runKey(x.edges)))];
    const widths = board.graph.nodes.map((n) => n.box.w).sort((a, b) => a - b);
    const box = board.graph.nodes.find((n) => n.id === board.focus)?.box;
    const focus = box && { x: box.x + box.w / 2, y: box.y + box.h / 2 };
    s = { board, done: { result, segments }, runs, ms, home: { minScale: 60 / widths[widths.length >> 1]!, ...(focus && { focus }) } };
    shown.set(board.id, s);
  }
  return s;
}

interface State {
  board: string;
  open: ReadonlySet<string>;
  selected: string | undefined;
}

const fromHash = (): string => {
  const id = location.hash.slice(1);
  return boards.some((b) => b.id === id) ? id : boards[0]!.id;
};

const state: State = { board: fromHash(), open: new Set(), selected: undefined };
const current = (): Shown => routed(boards.find((b) => b.id === state.board)!);

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
for (const b of boards) {
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
  const i = boards.findIndex((b) => b.id === state.board);
  const j = (i + (e.key === "ArrowRight" ? 1 : boards.length - 1)) % boards.length;
  pick(boards[j]!.id);
  row.querySelector<HTMLButtonElement>(`[data-board="${boards[j]!.id}"]`)?.focus();
  e.preventDefault();
});

$("zoom-in").addEventListener("click", () => view.zoomBy(1.6));
$("zoom-out").addEventListener("click", () => view.zoomBy(1 / 1.6));
$("zoom-fit").addEventListener("click", () => view.fit());
$("open-all").addEventListener("click", () => {
  state.open = new Set(current().runs);
  render();
});
$("close-all").addEventListener("click", () => {
  state.open = new Set();
  render();
});
addEventListener("hashchange", () => {
  if (fromHash() !== state.board) pick(fromHash());
});

/** This function shows another board. */
function pick(id: string): void {
  if (!boards.some((b) => b.id === id)) return;
  state.board = id;
  state.open = new Set();
  state.selected = undefined;
  if (location.hash.slice(1) !== id) history.replaceState(null, "", `#${id}`);
  boardText();
  render();
}

/** This function writes the text of the board: its name, its lead and the steps to try. */
function boardText(): void {
  const { board } = current();
  const text = TEXT[board.id] ?? "";
  const lede = text.split(/\r?\n## /)[0]!.trim();
  $("board-title").textContent = board.name;
  $("board-lede").innerHTML = html(lede);
  $("board-try").innerHTML = `<h3>Try this</h3>${html(sectionOf(text, "Try this"))}`;
  $("map").setAttribute("aria-label", `The map of the ${board.name.toLowerCase()}`);
  document.title = `${board.name}: highways examples`;
  for (const b of row.querySelectorAll<HTMLButtonElement>(".exit")) {
    const on = b.dataset["board"] === board.id;
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1;
  }
}

function render(): void {
  const s = current();
  const { board } = s;
  view.set({
    graph: board.graph,
    done: s.done,
    bundles: "unpack",
    level: "auto",
    selected: state.selected,
    open: state.open,
    cards: board.cards,
    noun: board.noun,
    // A card shows its routes when it is about 52 pixels wide. Its title is easy to read at that size.
    pick: { routesAt: 52, itemAt: 120 },
    groupPad: GAP / 2,
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
  const levels = current().done.result.levels ?? [];
  const badge = $("level-badge");
  const near = level >= levels.length;
  const groups = near ? 0 : levels[level]!.items.filter((i) => i.nodes.length > 1).length;
  badge.textContent = near ? "Near: each route" : `Far: ${fmt.format(groups)} ${groups === 1 ? "group" : "groups"}, zoom in for routes`;
  badge.classList.toggle("far", !near);
  badge.hidden = false;
}

boardText();
render();
