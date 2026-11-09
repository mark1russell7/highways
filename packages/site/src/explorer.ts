// The explorer page (EXPLORER-1). The build gives the newest committed sweep record, so the page reads no network.
// The explorer of `@mark1russell7/site-pages` reads the record only through `parseResponseRecord`, and it shows each fault of a bad record.
import { mountExplorer } from "@mark1russell7/site-pages/explorer";
import "@mark1russell7/site-pages/explorer.css";
import data from "virtual:explorer";
import { firstOption, SWEEP_DIR } from "./explorer-data.ts";
import { escapeAttribute as esc } from "@mark1russell7/text";
import "./style.css";

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`The page has no element "${id}".`);
  return el as T;
};

const REPO = "https://github.com/mark1russell7/highways";
const count = (n: number): string => n.toLocaleString("en-US");
const fileLink = (file: string): string => `<a href="${REPO}/blob/main/${SWEEP_DIR}/${encodeURIComponent(file)}"><code>${esc(file)}</code></a>`;
const facts = data.facts;

// The tiles at the top: the size and the date of the record.
$("tiles").innerHTML = (
  [
    [count(facts.strategies.length), "strategies"],
    [count(facts.options), "options"],
    [count(facts.inputs), "inputs"],
    [count(facts.points), "points"],
    [count(facts.measures.length), "measures"],
    [facts.date ?? "no commit", "date of the record"],
  ] as const
)
  // The date is a long value, so its tile has a smaller font that keeps it on one line.
  .map(([n, t]) => `<div><dt>${t}</dt><dd${t.startsWith("date") ? ' class="ex-date"' : ""}>${esc(n)}</dd></div>`)
  .join("");

// The size line: a small record is a sample, not the full space of the options.
$("size").innerHTML =
  facts.faults > 0
    ? `The record ${fileLink(facts.file)} has ${count(facts.faults)} faults. The explorer below shows them.`
    : `This record is ${fileLink(facts.file)}: <q>${esc(facts.name)}</q>. It has ${count(facts.points)} points on ${count(facts.inputs)} inputs, for the strategies ${facts.strategies.map((s) => `<code>${esc(s)}</code>`).join(", ")} of the step ${facts.steps.map((s) => `<code>${esc(s)}</code>`).join(", ")}. It is a sample of the space of the options, not the full space.`;

$("measures").textContent = facts.measures.length === 0 ? "" : `The record has ${count(facts.measures.length)} measures. A lower value is better for each measure.`;

const first = firstOption(data.record);
mountExplorer($("explorer"), data.record, first === undefined ? {} : { initial: { x: first } });

$("sources").innerHTML =
  data.others.length === 0
    ? `The folder <code>${SWEEP_DIR}</code> has 1 record.`
    : `The folder <code>${SWEEP_DIR}</code> also has ${data.others.map(fileLink).join(", ")}. The page shows the newest record.`;
