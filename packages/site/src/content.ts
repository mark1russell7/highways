import { marked } from "marked";
import readme from "../../../README.md?raw";

/** This function gives the Markdown of the section of `markdown` with the heading `## title`, without the heading. */
export function sectionOf(markdown: string, title: string): string {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === `## ${title}`);
  if (start < 0) return "";
  const end = lines.findIndex((l, i) => i > start && /^#{1,2} /.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end).join("\n").trim();
}

/** This function gives the first Markdown table of `markdown`, with the text before it. */
export function firstTable(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith("|"));
  if (start < 0) return "";
  let end = start;
  while (end < lines.length && lines[end]!.startsWith("|")) end++;
  return lines.slice(0, end).join("\n").trim();
}

/** This function gives the method of each router from the rows of a router table: `| \`name\` | method |`. */
export function routerMethods(markdown: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of markdown.split(/\r?\n/)) {
    const m = /^\|\s*`([a-z-]+)`\s*\|\s*(.+?)\s*\|\s*$/.exec(line);
    if (m) out.set(m[1]!, m[2]!);
  }
  return out;
}

/** This function changes Markdown to HTML. The input is the text of this repository, not text from a visitor. */
export const html = (markdown: string): string => marked.parse(markdown, { async: false });

/** This function changes one line of Markdown to inline HTML. */
export const inline = (markdown: string): string => marked.parseInline(markdown, { async: false });

const routers = sectionOf(readme, "The routers");

/** The text of the README for the page. The README stays the one source of this text. */
export const README = {
  idea: sectionOf(readme, "The idea"),
  routers: firstTable(routers),
  methods: routerMethods(routers),
  segments: sectionOf(readme, "The segments"),
} as const;
