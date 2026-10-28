import { listStrategies, STRATEGIES, type Step, type Strategy } from "@mark1russell7/highways";
import compareText from "../content/compare.md?raw";
import {
  cleanOptions,
  COLUMNS,
  COMPARE_BOARDS,
  formatHash,
  formatValue,
  PACKED_BOARD,
  PAGE_STEPS,
  parseHash,
  pickFirst,
  readPick,
  STEP_NAMES,
  type ComparePanels,
  type CompareState,
  type Panel,
} from "./compare-data.ts";
import { html, sectionOf } from "./content.ts";
import { optionSet } from "./option-control.ts";
import type { CompareReply, CompareRequest } from "./protocol.ts";
import "./style.css";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no element "${id}".`);
  return el as T;
};

const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const fmt = new Intl.NumberFormat("en-US");

/** The names of the axes of the fronts that are not columns of the page. */
const AXIS_NAMES: Readonly<Record<string, string>> = { "R1.perEdge": "crossings per edge" };

/** The noun of the strategies of each step. */
const NOUNS: Readonly<Record<Step, string>> = {
  group: "grouping rules",
  plugs: "plug rules",
  router: "routers",
  highway: "highway strategies",
  levels: "level rules",
  curve: "curves",
  room: "room strategies",
  whole: "whole strategies",
};

let state: CompareState = parseHash(location.hash);
/** The names of the hash that the step does not have. The note of the pick tells them until the next change. */
let unknown: readonly string[] = readPick(location.hash, state.step).unknown;
/** The last panels of the worker, so a change of the pick shows them again with no new run. */
let last: ComparePanels | undefined;
/** With `true`, the next panels scroll to the first picked panel. A link with a pick does this one time. */
let scrollToPick = (state.pick?.length ?? 0) > 0;

/** This function tells if a strategy is picked. */
const picked = (name: string): boolean => state.pick?.includes(name) ?? false;

/** This function gives the hash of the state without the pick. Two states with the same text need the same run. */
const runKey = (s: CompareState): string => formatHash({ step: s.step, board: s.board, options: s.options });

$("intro").innerHTML = html(compareText.split(/\r?\n## /)[0]!.trim());
$("howto-body").innerHTML = html(sectionOf(compareText, "How to read the panels"));

// The worker: one request at a time. A new request stops the old worker, so a slow step does not hold the page.
let worker: Worker | undefined;
let busy = false;
let next = 0;

function startWorker(): Worker {
  const w = new Worker(new URL("./compare.worker.ts", import.meta.url), { type: "module" });
  w.addEventListener("message", (event: MessageEvent<CompareReply>) => {
    if (event.data.id !== next) return;
    if (event.data.ok === "progress") {
      const p = event.data.progress;
      $("status").textContent = `The worker ran ${p.done} of ${p.total} ${NOUNS[state.step]}. The last one, ${p.strategy}, took ${fmt.format(Math.round(p.ms))} ms…`;
      return;
    }
    busy = false;
    $("panels").setAttribute("aria-busy", "false");
    if (event.data.ok) {
      last = event.data.panels;
      show(last);
    }
    else $("status").textContent = `The worker stopped: ${event.data.error}`;
  });
  return w;
}

/** This function asks the worker for the panels of the state. */
function run(): void {
  if (busy && worker) {
    worker.terminate();
    worker = undefined;
  }
  worker ??= startWorker();
  busy = true;
  next++;
  const board = COMPARE_BOARDS.find((b) => b.id === state.board)!;
  const count = listStrategies(STRATEGIES, state.step).length;
  $("status").textContent = `The worker runs ${count} ${NOUNS[state.step]} on ${board.name}…`;
  $("panels").setAttribute("aria-busy", "true");
  $("panels").classList.add("stale");
  const request: CompareRequest = { id: next, state };
  worker.postMessage(request);
}

/** This function sets the state, writes the hash, and asks for the panels again. */
function set(change: Partial<CompareState>): void {
  const step = change.step ?? state.step;
  // The names of a pick are names of one step, so a new step clears the pick.
  const pick = change.pick ?? (change.step && change.step !== state.step ? [] : (state.pick ?? []));
  const before = runKey(state);
  state = { step, board: change.board ?? state.board, options: cleanOptions(step, change.options ?? (change.step ? {} : state.options)), ...(pick.length > 0 ? { pick } : {}) };
  unknown = [];
  const hash = formatHash(state);
  if (location.hash !== hash) history.replaceState(null, "", hash);
  controls();
  if (runKey(state) !== before || !last) run();
  else show(last);
}

/** This function picks a strategy, or removes it from the pick. The panels do not run again. */
function togglePick(name: string): void {
  const pick = state.pick ?? [];
  set({ pick: pick.includes(name) ? pick.filter((n) => n !== name) : [...pick, name] });
}

// The steps: a row of exit signs.
const stepRow = $("steps");
for (const step of PAGE_STEPS) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "exit";
  button.setAttribute("role", "radio");
  button.dataset["step"] = step;
  button.textContent = STEP_NAMES[step];
  button.addEventListener("click", () => {
    if (state.step !== step) set({ step });
  });
  stepRow.append(button);
}
stepRow.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
  const i = PAGE_STEPS.indexOf(state.step);
  const step = PAGE_STEPS[(i + (e.key === "ArrowRight" ? 1 : PAGE_STEPS.length - 1)) % PAGE_STEPS.length]!;
  set({ step });
  stepRow.querySelector<HTMLButtonElement>(`[data-step="${step}"]`)?.focus();
  e.preventDefault();
});

const boardSelect = $<HTMLSelectElement>("board");
for (const b of COMPARE_BOARDS) {
  const option = document.createElement("option");
  option.value = b.id;
  option.textContent = `${b.name}: ${fmt.format(b.nodes)} nodes, ${fmt.format(b.edges)} edges`;
  boardSelect.append(option);
}
boardSelect.addEventListener("change", () => set({ board: boardSelect.value }));
$("reset").addEventListener("click", () => set({ options: {} }));
addEventListener("hashchange", () => {
  const parsed = parseHash(location.hash);
  if (formatHash(parsed) === formatHash(state)) return;
  const again = runKey(parsed) !== runKey(state) || !last;
  state = parsed;
  unknown = readPick(location.hash, state.step).unknown;
  scrollToPick = (state.pick?.length ?? 0) > 0;
  controls();
  if (again) run();
  else show(last!);
});

/** This function sets one option of one strategy. The value `undefined` sets the default. */
function setOption(strategy: string, key: string, v: number | boolean | string | undefined): void {
  const own: Record<string, unknown> = { ...state.options[strategy] };
  if (v === undefined) delete own[key];
  else own[key] = v;
  set({ options: { ...state.options, [strategy]: own as Record<string, number | boolean | string> } });
}

/** This function writes the controls of the state: the step, the board and the options of each strategy. */
function controls(): void {
  for (const b of stepRow.querySelectorAll<HTMLButtonElement>(".exit")) {
    const on = b.dataset["step"] === state.step;
    b.setAttribute("aria-checked", String(on));
    b.tabIndex = on ? 0 : -1;
  }
  boardSelect.value = state.board;
  const body = $("option-body");
  body.replaceChildren();
  let changed = 0;
  // The options of the picked strategies come first.
  const all = (listStrategies(STRATEGIES, state.step) as readonly Strategy<Step, object>[]).map((st) => ({ strategy: st.name, st }));
  for (const { st: strategy } of pickFirst(all, state.pick)) {
    const group = optionSet("opt", strategy, state.options[strategy.name], (key, v) => setOption(strategy.name, key, v));
    if (!group) continue;
    body.append(group);
    changed += Object.keys(state.options[strategy.name] ?? {}).length;
  }
  if (body.childElementCount === 0) body.textContent = "The strategies of this step have no options.";
  $("option-count").textContent = changed > 0 ? `(${changed} changed)` : "";
  $<HTMLButtonElement>("reset").disabled = changed === 0;
  pickNote();
}

/** This function writes the note of the pick: the picked strategies, and the names of the link that the step does not have. */
function pickNote(): void {
  const pick = state.pick ?? [];
  const parts: string[] = [];
  if (pick.length > 0) parts.push(`Picked: ${pick.map((n) => `<strong>${esc(n)}</strong>`).join(", ")}. The page shows them first.`);
  if (unknown.length > 0) parts.push(`The step ${esc(STEP_NAMES[state.step])} has no strategy with the name ${unknown.map((n) => `<code>${esc(n)}</code>`).join(", ")}, so the page ignores ${unknown.length === 1 ? "it" : "them"}.`);
  $("pick-text").innerHTML = parts.join(" ");
  $("pick-clear").hidden = pick.length === 0;
  $("pick-note").hidden = parts.length === 0;
}

/** This function draws one panel as SVG. */
function svgOf(p: Panel, board: string): string {
  const { view, boxes, groups, paths } = p.drawing;
  const rects = boxes.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"/>`).join("");
  const outlines = groups.map((b) => `<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" rx="${Math.min(b.w, b.h) * 0.04}"/>`).join("");
  const lines = paths.map((l) => `<path d="${l.d}"${l.width === 1 ? "" : ` style="stroke-width:${l.width.toFixed(1)}px"`}/>`).join("");
  return `<svg class="cmp-map" viewBox="${view.x} ${view.y} ${view.w} ${view.h}" role="img" aria-label="The output of ${esc(p.strategy)} on ${esc(board)}"><g class="cmp-groups">${outlines}</g><g class="cmp-routes">${lines}</g><g class="cmp-boxes">${rects}</g></svg>`;
}

/** This function writes the tags of a panel: the front and the faults of the hard rules. */
function tagsOf(p: Panel): string {
  const tags: string[] = [];
  if (picked(p.strategy)) tags.push(`<span class="tag picked">Picked</span>`);
  if (p.skipped) return [...tags, `<span class="tag">Skipped: ${esc(p.skipped)}</span>`].join("");
  if (p.front) tags.push(`<span class="tag front">On the front</span>`);
  if (p.violations > 0) tags.push(`<span class="tag bad">${fmt.format(p.violations)} hard-rule ${p.violations === 1 ? "fault" : "faults"}</span>`);
  return tags.join("");
}

/** This function gives the time of a panel, in milliseconds. */
const timeOf = (p: Panel): number => p.measures.find((m) => m.key === "ms")?.value ?? 0;

/** This function shows the panels and the table of the measures. */
function show(all: ComparePanels): void {
  const data: ComparePanels = { ...all, panels: pickFirst(all.panels, state.pick) };
  const board = COMPARE_BOARDS.find((b) => b.id === data.board)!;
  const columns = COLUMNS[data.step];
  const front = data.panels.filter((p) => p.front).map((p) => `<strong>${esc(p.strategy)}</strong>`);
  const axes = data.objectives.map((o) => `${AXIS_NAMES[o.key] ?? columns.find((c) => c.key === o.key)?.label.toLowerCase() ?? o.key} ${o.better === "min" ? "↓" : "↑"}`);
  // The slowest strategies, when the step has many strategies: their time is most of the time of the step.
  const slow = data.panels.length > 10 ? [...data.panels].sort((a, b) => timeOf(b) - timeOf(a)).slice(0, 3).map((p) => `${p.strategy} ${fmt.format(Math.round(timeOf(p)))} ms`) : [];
  const room = data.step === "room" && data.board !== PACKED_BOARD ? " This board is not packed, so a gap opens only when its links need more room. Choose Packed grid for a packed board." : "";
  $("status").textContent = `${data.panels.length} ${NOUNS[data.step]} on ${board.name} (${fmt.format(data.nodes)} nodes, ${fmt.format(data.edges)} edges): ${fmt.format(Math.round(data.ms))} ms on this device.${slow.length ? ` The slowest: ${slow.join(", ")}.` : ""}${room}`;
  $("front").innerHTML = `Pareto front: ${front.join(", ") || "no strategy"}. Its axes: ${esc(axes.join(", "))}.`;

  // The table: one row for each strategy, one column for each measure, with a bar of the value against the largest value.
  const largest = columns.map((c) => Math.max(0, ...data.panels.map((p) => p.measures.find((m) => m.key === c.key)?.value ?? 0).filter((v) => Number.isFinite(v))));
  const head = `<thead><tr><th scope="col">${STEP_NAMES[data.step]}</th>${columns.map((c) => `<th scope="col" title="${esc(c.describe)}">${esc(c.label)}${c.better ? (c.better === "min" ? " ↓" : " ↑") : ""}</th>`).join("")}</tr></thead>`;
  const rows = data.panels.map((p) => {
    const cells = columns.map((c, i) => {
      const m = p.measures.find((x) => x.key === c.key)!;
      const f = m.value === Infinity ? 1 : largest[i]! > 0 && Number.isFinite(m.value) ? Math.max(0, m.value) / largest[i]! : 0;
      return `<td${m.best ? ' class="best"' : ""}>${esc(formatValue(m.value, c))}${m.best ? '<span class="star" aria-label="best"> ★</span>' : ""}<span class="bar" style="--f:${f.toFixed(3)}"></span></td>`;
    });
    const name = `<button type="button" class="table-pick" data-panel="${esc(p.strategy)}"><code>${esc(p.strategy)}</code></button>${p.front ? ' <span class="dot" title="On the Pareto front">◆</span>' : ""}`;
    const cls = [p.violations > 0 || p.skipped ? "faulty" : "", picked(p.strategy) ? "picked" : ""].filter(Boolean).join(" ");
    return `<tr${cls ? ` class="${cls}"` : ""}><th scope="row">${name}</th>${cells.join("")}</tr>`;
  });
  $("table").innerHTML = `${head}<tbody>${rows.join("")}</tbody>`;

  const grid = $("panels");
  grid.innerHTML = data.panels
    .map((p) => {
      const measures = p.measures
        .map((m, i) => `<div${m.best ? ' class="best"' : ""} title="${esc(columns[i]!.describe)}"><dt>${esc(m.label)}</dt><dd>${esc(formatValue(m.value, columns[i]!))}${m.best ? '<span class="star" aria-label="best"> ★</span>' : ""}</dd></div>`)
        .join("");
      const options = Object.entries(p.options).map(([k, v]) => `<code>${esc(k)} ${esc(String(v))}</code>`).join(" ");
      const on = picked(p.strategy);
      const cls = ["cmp-panel", p.front ? "front" : "", p.violations > 0 || p.skipped ? "faulty" : "", on ? "picked" : ""].filter(Boolean).join(" ");
      const toggle = `<button type="button" class="link cmp-pick" data-pick="${esc(p.strategy)}" aria-pressed="${on}">${on ? "Remove the pick" : "Pick"}</button>`;
      return `<article class="${cls}" id="panel-${esc(p.strategy)}" aria-labelledby="title-${esc(p.strategy)}">
        <header class="cmp-head"><h3 id="title-${esc(p.strategy)}">${esc(p.strategy)}</h3><div class="cmp-tags">${tagsOf(p)}${toggle}</div></header>
        <p class="cmp-describe">${esc(p.describe)}${options ? `<br />Options: ${options}` : ""}</p>
        ${svgOf(p, board.name)}
        <dl class="cmp-measures">${measures}</dl>
      </article>`;
    })
    .join("");
  grid.classList.remove("stale");
  const first = state.pick?.[0];
  if (scrollToPick && first) {
    scrollToPick = false;
    document.getElementById(`panel-${first}`)?.scrollIntoView({ behavior: "auto", block: "start" });
  }
}

$("panels").addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-pick]");
  if (button) togglePick(button.dataset["pick"]!);
});
$("pick-clear").addEventListener("click", () => set({ pick: [] }));

$("table").addEventListener("click", (e) => {
  const button = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-panel]");
  const panel = button && document.getElementById(`panel-${button.dataset["panel"]}`);
  panel?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
});

if (location.hash !== formatHash(state)) history.replaceState(null, "", formatHash(state));
controls();
run();
