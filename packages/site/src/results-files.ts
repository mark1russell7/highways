/// <reference types="node" />
// The build reads the committed files of the results page with these functions. Only `vite.config.ts` and the tests use them.
// They read the repository on disk. They never use the network.
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { MEASURES } from "@mark1russell7/highways";
import { marked } from "marked";
import { resultsData, type IdeaRecord, type MeasureRow, type ResultsData } from "./results-data.ts";

/** The folders of the committed files, relative to the root of the repository. */
export const RESULT_FILES = {
  verdicts: "docs/research/verdicts",
  ideas: "docs/research/ideas",
  roadmap: "docs/ROADMAP.md",
  text: "packages/site/content/results.md",
  core: "packages/core/package.json",
  /** The benchmark snapshot: `bench.json` and `bench-meta.json` of one run of the workflow `Bench`. */
  bench: "docs/research/bench",
  /** The idea queue that `pnpm queue` writes (IDEA-QUEUE). */
  queue: "docs/research/queue.json",
} as const;

/** This function gives the snapshot files of the folder of verdicts: each JSON file. */
export function snapshotFiles(root: string): { readonly name: string; readonly text: string }[] {
  const dir = join(root, RESULT_FILES.verdicts);
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((name) => ({ name, text: readFileSync(join(dir, name), "utf8") }));
}

/** This function gives the idea records of each family file. A file that is not a list of records, for example `index.json`, does not count. */
export function ideaRecords(root: string): IdeaRecord[] {
  const dir = join(root, RESULT_FILES.ideas);
  const out: IdeaRecord[] = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith(".json")).sort()) {
    const value = JSON.parse(readFileSync(join(dir, f), "utf8")) as unknown;
    if (Array.isArray(value)) out.push(...(value as IdeaRecord[]));
  }
  return out;
}

/** This function gives the sections of a Markdown text as HTML, by their `## ` headings. The text before the first heading has the key `intro`. */
export function textSections(markdown: string): Record<string, string> {
  const out: Record<string, string> = {};
  const parts = markdown.split(/\r?\n(?=## )/);
  for (const part of parts) {
    const m = /^## (.+)\r?\n/.exec(part);
    const key = m ? m[1]!.trim() : "intro";
    out[key] = marked.parse(m ? part.slice(m[0].length) : part, { async: false }).trim();
  }
  return out;
}

/** This function gives the measures of the records from `MEASURES` of the core, with the definition of each measure that has one. */
export function measureRows(): MeasureRow[] {
  return MEASURES.map((m) => ({ id: m.id, name: m.name, unit: m.unit, better: m.better, definition: m.definition ?? "" }));
}

/** This function makes the data of the results page from the files of the repository at `root`. */
export function readResults(root: string): ResultsData {
  return resultsData({
    snapshots: snapshotFiles(root),
    ideas: ideaRecords(root),
    roadmap: readFileSync(join(root, RESULT_FILES.roadmap), "utf8"),
    inline: (md) => marked.parseInline(md, { async: false }),
    text: textSections(readFileSync(join(root, RESULT_FILES.text), "utf8")),
    queue: readFileSync(join(root, RESULT_FILES.queue), "utf8"),
    measures: measureRows(),
  });
}

/** The facts of one build of the site: the version of the core, the commit and the date. */
export interface BuildInfo {
  readonly core: string;
  readonly commit: string;
  readonly date: string;
}

/** This function gives the facts of the build. In CI, `GITHUB_SHA` gives the commit. Outside git, the commit is empty. */
export function buildInfo(root: string, env: Readonly<Record<string, string | undefined>>): BuildInfo {
  const core = (JSON.parse(readFileSync(join(root, RESULT_FILES.core), "utf8")) as { version: string }).version;
  let commit = env["GITHUB_SHA"] ?? "";
  if (commit === "") {
    try {
      commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
    } catch {
      commit = "";
    }
  }
  return { core, commit, date: new Date().toISOString().slice(0, 10) };
}

/** This function gives the data line of a page as HTML: the core release, the commit and the date of the build. */
export function dataLineHtml(info: BuildInfo): string {
  const repo = "https://github.com/mark1russell7/highways";
  const commit = info.commit === "" ? "a local checkout" : `commit <a href="${repo}/commit/${info.commit}"><code>${info.commit.slice(0, 7)}</code></a>`;
  return `Core <a href="https://www.npmjs.com/package/@mark1russell7/highways/v/${info.core}"><code>${info.core}</code></a>. Built from ${commit} on ${info.date}.`;
}
