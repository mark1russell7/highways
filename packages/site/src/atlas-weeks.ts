// The weeks of the atlas after the newest committed record (ATLAS-WEEKLY), and the gate against the live page.
// This module has no access to the file system, to git and to the network, so the build and the tests use the same rules.
import { addDays, byText } from "./atlas-data.ts";

/** The format of the file `atlas-weeks.json` of the site. */
export const ATLAS_WEEKS_FORMAT = "atlas-weeks/1";

/** The name of the file of the weeks in the site. The atlas page links it. */
export const ATLAS_WEEKS_FILE = "atlas-weeks.json";

/** The address of the live site. The build compares its weeks with the weeks of the live site. */
export const LIVE_SITE = "https://mark1russell7.github.io/highways/";

/** The days from one weekly record to the next. */
export const WEEK_DAYS = 7;

/** The source of one weekly record of the page. */
export interface WeekSource {
  readonly date: string;
  /** The value `committed` tells that the record is a file of `docs/research/atlas/`. The value `derived` tells that the build made it from the history. */
  readonly source: "committed" | "derived";
  /** The commit that the build read for a derived record. It is empty for a committed record. */
  readonly commit: string;
  /**
   * The value `true` tells that no later build can change the record.
   * A derived record is final when the history of the build has a commit after the end of its date. A committed record is always final.
   */
  readonly final: boolean;
  /** The SHA-256 of the text of the record, as `weekText` gives it. */
  readonly sha256: string;
}

/** One week that the build did not derive, with the reason. */
export interface WeekGap {
  readonly date: string;
  readonly reason: string;
}

/** The file `atlas-weeks.json` of the site: the source of each weekly record, and each week that the build did not derive. */
export interface AtlasWeeksFile {
  readonly format: typeof ATLAS_WEEKS_FORMAT;
  /** The date of the build, as `YYYY-MM-DD`. */
  readonly built: string;
  /** The commit of the build. It is empty outside git. */
  readonly head: string;
  readonly weeks: readonly WeekSource[];
  readonly skipped: readonly WeekGap[];
}

/**
 * This function gives the dates of the weeks that the build derives.
 * The first date is 7 days after the newest committed record. Each next date is 7 days later. The last date is at or before the build date.
 *
 * @param newest - The date of the newest committed record. An empty text gives no date.
 * @param built - The date of the build, as `YYYY-MM-DD` in UTC.
 */
export function weekDates(newest: string, built: string): string[] {
  if (newest === "") return [];
  const out: string[] = [];
  for (let d = addDays(newest, WEEK_DAYS); byText(d, built) <= 0; d = addDays(d, WEEK_DAYS)) out.push(d);
  return out;
}

/** The time of the end of a date in UTC, as `YYYY-MM-DDT23:59:59Z`. The derivation reads the last commit at or before this time. */
export const endOfDay = (date: string): string => `${date}T23:59:59Z`;

/** The answer of one fetch: a status and a body, or the error of the network. */
export type LiveAnswer = { readonly status: number; readonly body: string } | { readonly error: string };

/** The result of the gate against the live site: pass or fail, and one line for the log of the build. */
export interface LiveVerdict {
  readonly ok: boolean;
  readonly line: string;
}

/** The pattern of a link to the file of the weeks in the HTML of the atlas page. */
const WEEKS_LINK = /href="(?:[^"]*\/)?atlas-weeks\.json"/;

/** This function gives the text of an answer for a message: its status, or its error. */
const answerText = (a: LiveAnswer): string => ("error" in a ? `the error "${a.error}"` : `the status ${a.status}`);

/**
 * This function gives the result of the gate when the live site has no file of the weeks (the status 404).
 * Only the first deploy of the file passes. The live atlas page then answers 200 and has no link to the file.
 * When the live atlas page links the file, the site published it before, so the 404 is an outage, and the build fails.
 *
 * @param page - The answer of the live atlas page.
 */
export function firstDeploy(page: LiveAnswer): LiveVerdict {
  if ("error" in page || page.status !== 200) return { ok: false, line: `The live ${ATLAS_WEEKS_FILE} gave 404, and the live atlas page gave ${answerText(page)}. The build cannot tell if this is the first deploy.` };
  if (WEEKS_LINK.test(page.body)) return { ok: false, line: `The live ${ATLAS_WEEKS_FILE} gave 404, but the live atlas page links it. The site published the file before, so the 404 is an outage.` };
  return { ok: true, line: `The live ${ATLAS_WEEKS_FILE} gave 404, and the live atlas page has no link to it. This is the first deploy of the file.` };
}

/**
 * This function compares the weeks of the live site with the weeks of this build.
 * Each final week of the live site must be a final week of this build, with the same SHA-256. A week that is not final on the live site does not count.
 *
 * @param local - The file of the weeks of this build.
 * @param live - The text of the live file of the weeks.
 */
export function compareLive(local: AtlasWeeksFile, live: string): LiveVerdict {
  let value: Partial<AtlasWeeksFile>;
  try {
    value = JSON.parse(live) as Partial<AtlasWeeksFile>;
  } catch {
    return { ok: false, line: `The live ${ATLAS_WEEKS_FILE} is not JSON.` };
  }
  if (value.format !== ATLAS_WEEKS_FORMAT || !Array.isArray(value.weeks)) return { ok: false, line: `The live ${ATLAS_WEEKS_FILE} has no format "${ATLAS_WEEKS_FORMAT}" and no weeks.` };
  const here = new Map(local.weeks.map((w) => [w.date, w] as const));
  const problems: string[] = [];
  const final = value.weeks.filter((w) => w.final);
  for (const w of final) {
    const mine = here.get(w.date);
    const gap = local.skipped.find((g) => g.date === w.date);
    if (mine === undefined) problems.push(`The week ${w.date} is on the live site, but not in this build${gap === undefined ? "" : `: ${gap.reason}`}`);
    else if (!mine.final) problems.push(`The week ${w.date} is final on the live site, but not in this build. This build reads an older history than the live site`);
    else if (mine.sha256 !== w.sha256) problems.push(`The week ${w.date} has the SHA-256 ${w.sha256} on the live site and ${mine.sha256} in this build`);
  }
  if (problems.length > 0) return { ok: false, line: `A past week of the atlas changed. ${problems.join(". ")}.` };
  return { ok: true, line: `The live ${ATLAS_WEEKS_FILE} has ${value.weeks.length} weeks. Each of its ${final.length} final weeks has the same SHA-256 in this build.` };
}

/**
 * This function gives the result of the gate against the live site from the answers of the two fetches.
 *
 * @param local - The file of the weeks of this build.
 * @param weeks - The answer of the live file of the weeks.
 * @param page - The answer of the live atlas page. The build fetches it only after a 404 of the file of the weeks.
 */
export function liveVerdict(local: AtlasWeeksFile, weeks: LiveAnswer, page?: LiveAnswer): LiveVerdict {
  if ("error" in weeks) return { ok: false, line: `The build cannot fetch the live ${ATLAS_WEEKS_FILE}: ${weeks.error}` };
  if (weeks.status === 200) return compareLive(local, weeks.body);
  if (weeks.status === 404) return firstDeploy(page ?? { error: "the build did not fetch the live atlas page" });
  return { ok: false, line: `The live ${ATLAS_WEEKS_FILE} gave the status ${weeks.status}. The gate passes only on 200, or on 404 at the first deploy.` };
}
