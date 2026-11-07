// The atlas page (SOLVED-ATLAS). The build gives all its data from the committed records, so the page reads no network.
import data from "virtual:atlas";
import { addDays, SOLVED_DAYS, STATES, type AtlasRegion, type RegionEntry, type RegionState } from "./atlas-data.ts";
import { ageText } from "./results-data.ts";
import { cardId } from "./strategies-data.ts";
import "./style.css";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no element "${id}".`);
  return el as T;
};

const esc = (text: string): string => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const REPO = "https://github.com/mark1russell7/highways";
/** The date of the viewer. A page built some time ago still shows the true age of its records. */
const TODAY = new Date().toISOString().slice(0, 10);
const DAY_MS = 86_400_000;
const daysFrom = (from: string, to: string): number => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);

/** The mark of each state. The page does not show a state by its color only. */
const GLYPH: Readonly<Record<RegionState, string>> = { solved: "●", held: "◔" };
/** The class of each state. */
const CLS: Readonly<Record<RegionState, string>> = { solved: "lab-better", held: "lab-mix" };
/** The steps in the sequence of the pipeline. A step that is not in this list comes after them. */
const STEP_ORDER = ["router", "highway", "plugs", "levels", "whole"];
/** The longest name in a cell. A longer name ends with an ellipsis, and the label of the cell has the full name. */
const SHORT = 12;

const short = (name: string): string => (name.length > SHORT ? `${name.slice(0, SHORT - 1)}…` : name);
const num = (value: number): string => (Number.isInteger(value) ? String(value) : Number(value.toPrecision(4)).toString());
const byNatural = (a: string, b: string): number => a.localeCompare(b, "en", { numeric: true });
const stepRank = (s: string): number => (STEP_ORDER.includes(s) ? STEP_ORDER.indexOf(s) : STEP_ORDER.length);

const regions = data.view.regions;
const summary = data.view.summary;
const sets = [...new Set(regions.map((r) => r.set))].sort(byNatural);
const ALL = "all";
const state = {
  set: sets.at(-1) ?? "",
  step: "",
  states: new Set<RegionState>(STATES),
  pick: undefined as string | undefined,
};

/** This function gives the key of a cell on the page. */
const keyOf = (r: AtlasRegion): string => [r.set, r.step, r.guard, r.measure, r.family].join("|");

$("intro").innerHTML = data.text["intro"] ?? "";
$("map-body").innerHTML = data.text["The map of the regions"] ?? "";
$("rules-body").innerHTML = data.text["The rules"] ?? "";
$("weeks-body").innerHTML = data.text["The weekly records"] ?? "";

// The tiles at the top: the solved regions first, then the regions, the weeks and the earliest date of a solve.
function tiles(): void {
  const items: [string, string, string][] = [
    [String(summary.solved), "solved regions", "#map"],
    [summary.regions.toLocaleString("en-US"), "regions in the latest record", "#map"],
    [String(summary.weeks), summary.weeks === 1 ? "week of records" : "weeks of records", "#weeks"],
    [esc(summary.earliest === "" ? "-" : summary.earliest), "earliest date that a region can be solved", "#rules"],
  ];
  // The date tile keeps its date on one line, also on a phone.
  $("tiles").innerHTML = items.map(([n, t, href], i) => `<div${i === items.length - 1 ? ' class="atl-date"' : ""}><dt><a href="${href}">${t}</a></dt><dd>${n}</dd></div>`).join("");
  if (summary.earliest === "") {
    $("wait").textContent = "";
    return;
  }
  const left = daysFrom(TODAY, summary.earliest);
  const when = left > 0 ? ` That is ${left} ${left === 1 ? "day" : "days"} from today.` : "";
  $("wait").innerHTML =
    summary.solved === 0
      ? `<b aria-hidden="true">${GLYPH.held}</b> The count of solved regions stays 0 until ${esc(summary.earliest)}, because the rule needs one leader for 4 weeks.${when}`
      : `<b aria-hidden="true">${GLYPH.held}</b> The next region that is held can be solved on ${esc(summary.earliest)}.${when}`;
}

// The radio buttons of the set and of the step.
function radios(id: string, values: readonly string[], current: string, pick: (v: string) => void): void {
  const el = $(id);
  el.innerHTML = values.map((v) => `<label><input type="radio" name="${id}" value="${esc(v)}"${v === current ? " checked" : ""} /><span>${esc(v)}</span></label>`).join("");
  for (const input of el.querySelectorAll<HTMLInputElement>("input")) input.addEventListener("change", () => pick(input.value));
}

function controls(): void {
  radios("sets", sets, state.set, (v) => {
    state.set = v;
    state.pick = undefined;
    draw();
  });
  const steps = [...new Set(regions.filter((r) => r.set === state.set).map((r) => r.step))].sort((a, b) => stepRank(a) - stepRank(b) || byNatural(a, b));
  // The page opens on the first step, so a reader sees one grid first. The choice `all` shows each step.
  if (state.step === "" || (state.step !== ALL && !steps.includes(state.step))) state.step = steps[0] ?? ALL;
  radios("steps", [ALL, ...steps], state.step, (v) => {
    state.step = v;
    state.pick = undefined;
    grids();
  });
  $("states").innerHTML = STATES.map(
    (s) => `<label class="res-chip ${CLS[s]}"><input type="checkbox" value="${s}"${state.states.has(s) ? " checked" : ""} /><span><b aria-hidden="true">${GLYPH[s]}</b> ${s}</span></label>`,
  ).join("");
  for (const input of $("states").querySelectorAll<HTMLInputElement>("input"))
    input.addEventListener("change", () => {
      const s = input.value as RegionState;
      if (input.checked) state.states.add(s);
      else state.states.delete(s);
      grids();
    });
}

/** This function gives the text of a cell for a screen reader. */
function cellLabel(r: AtlasRegion): string {
  const who = r.leader.strategy === r.base ? `${r.leader.strategy}, the base` : r.leader.strategy;
  return `${r.family}, ${r.guard}: ${who}, ${r.state}, ${r.days} of ${SOLVED_DAYS} days`;
}

/** This function gives one cell of a grid as HTML. */
function cell(r: AtlasRegion): string {
  const on = state.states.has(r.state);
  const key = keyOf(r);
  const picked = state.pick === key;
  const isBase = r.leader.strategy === r.base;
  const fill = Math.min(1, r.days / SOLVED_DAYS);
  return `<td><button type="button" class="res-cell atl-cell ${CLS[r.state]}${isBase ? " atl-base" : ""}${on ? "" : " off"}${picked ? " picked" : ""}" data-k="${esc(key)}" aria-pressed="${picked}" aria-label="${esc(cellLabel(r))}" title="${esc(r.leader.strategy)}"><span class="res-lab"><b aria-hidden="true">${GLYPH[r.state]}</b> ${esc(short(r.leader.strategy))}</span><span class="res-breadth">${isBase ? "base" : `+${num(r.leader.mean)}`}</span><span class="atl-days" aria-hidden="true"><i style="width:${(fill * 100).toFixed(1)}%"></i></span></button></td>`;
}

// The grids: for each step, the family rows and the guard columns.
function grids(): void {
  const inSet = regions.filter((r) => r.set === state.set);
  const steps = [...new Set(inSet.map((r) => r.step))].filter((s) => state.step === ALL || s === state.step).sort((a, b) => stepRank(a) - stepRank(b) || byNatural(a, b));
  const shown = inSet.filter((r) => steps.includes(r.step));
  const counts = STATES.map((s) => [s, shown.filter((r) => r.state === s).length] as const);
  const leaders = shown.filter((r) => r.leader.strategy !== r.base).length;
  $("summary").innerHTML = `${shown.length} regions of <code>${esc(state.set)}</code>${state.step === ALL ? ` over ${steps.length} steps` : ` on the step <code>${esc(state.step)}</code>`}. ${counts
    .map(([s, n]) => `<span class="res-count ${CLS[s]}"><b aria-hidden="true">${GLYPH[s]}</b> ${n} ${s}</span>`)
    .join(" ")} ${leaders} with a leader that is not the base.`;
  $("grids").innerHTML = steps
    .map((step) => {
      const of = inSet.filter((r) => r.step === step);
      const guards = [...new Map(of.map((r) => [r.guard, r.measure] as const))].sort((a, b) => byNatural(a[0], b[0]));
      const families = [...new Set(of.map((r) => r.family))].sort(byNatural);
      const at = new Map(of.map((r) => [`${r.guard}|${r.family}`, r] as const));
      const head = `<tr><th scope="col">Family</th>${guards.map(([g, m]) => `<th scope="col">${esc(g)}<small>${esc(m)}</small></th>`).join("")}</tr>`;
      const body = families
        .map((f) => `<tr><th scope="row">${esc(f)}</th>${guards.map(([g]) => { const r = at.get(`${g}|${f}`); return r === undefined ? "<td></td>" : cell(r); }).join("")}</tr>`)
        .join("");
      const base = of[0]?.base ?? "";
      return `<h3 class="atl-step"><code>${esc(step)}</code> <small>base <code>${esc(base)}</code>, ${of.length} regions</small></h3><div class="table-wrap res-grid-wrap scroll-cue" tabindex="0" aria-label="${esc(`The regions of the step ${step}, by family and guard measure`)}"><table class="res-grid atl-grid"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
    })
    .join("");
  if (steps.length === 0) $("grids").innerHTML = "<p>No region has these filters.</p>";
  for (const b of $("grids").querySelectorAll<HTMLButtonElement>("button[data-k]"))
    b.addEventListener("click", () => {
      state.pick = b.dataset["k"];
      grids();
      // On a phone the panel is below the grids, so the page moves to it.
      if (matchMedia("(max-width: 860px)").matches) $("detail").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  detail();
}

/** This function gives an entry of a region as HTML, with a link to its card when it is not the base. */
function entry(r: AtlasRegion, e: RegionEntry): string {
  const name = `<code>${esc(e.strategy)}</code>`;
  const link = e.strategy === r.base ? `${name} (the base)` : `<a href="strategies.html#${esc(cardId(r.step, e.strategy))}" title="The card of the strategy">${name}</a>`;
  return `${link}, mean ${e.mean > 0 ? "+" : ""}${num(e.mean)} on ${e.n} ${e.n === 1 ? "board" : "boards"}`;
}

// The detail of the selected region.
function detail(): void {
  const r = regions.find((x) => keyOf(x) === state.pick);
  if (r === undefined) {
    $("detail").innerHTML = `<p class="hint">Select a cell to see its leader, its runner-up and its run.</p><p class="hint">The latest record is from ${esc(summary.latest || "-")}.</p>`;
    return;
  }
  const solveOn = addDays(r.since, SOLVED_DAYS);
  const rows: [string, string][] = [
    ["Leader", entry(r, r.leader)],
    ["Runner-up", r.runnerUp === null ? "none" : entry(r, r.runnerUp)],
    ["Since", esc(r.since)],
    ["Days held", `${r.days} of ${SOLVED_DAYS}`],
    ["State", `<span class="res-count ${CLS[r.state]}"><b aria-hidden="true">${GLYPH[r.state]}</b> ${r.state}</span>${r.state === "held" ? ` <small>until ${esc(solveOn)} at the earliest</small>` : ""}`],
    ["Bound", esc(r.bound)],
    ["Source run", `<a href="${REPO}/actions/runs/${r.run}">${r.run}</a>`],
    ["Core", `<code>${esc(r.core)}</code>`],
  ];
  $("detail").innerHTML = `<p class="method"><strong><code>${esc(r.family)}</code></strong> ${esc(r.guard)} <small>(${esc(r.measure)})</small> on <code>${esc(r.step)}</code>, <code>${esc(r.set)}</code></p>
    <dl class="atl-facts">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>
    <p class="hint">A positive mean tells that the strategy is better than the base <code>${esc(r.base)}</code> on this family.</p>`;
}

// The age of the latest record, by the date of the viewer.
function age(): void {
  $("age").textContent = summary.latest === "" ? "No record exists." : `${summary.weeks} ${summary.weeks === 1 ? "record" : "records"}. The latest record is from ${summary.latest}, ${ageText(Math.max(0, daysFrom(summary.latest, TODAY)))}.`;
}

function draw(): void {
  controls();
  grids();
}

tiles();
draw();
age();
