// The commits of a time gate (GATE-CONFIRM-SHA). The job resolves the head and the parent to full hashes one time, at the start.
// Then each step gets only the full hashes, so a step does not resolve a name again on a branch that moved.
// A name that does not resolve fails the job (FAIL-CLOSED).
// This module imports only node modules, so a job with no installed packages can start it.
// Usage as a command: node scripts/gates/commits.ts --head <name> --parent <name>
//   An empty head is `HEAD`, the checkout. An empty parent is `<head>^1`, the first parent of the head.
//   The command writes the lines `head=`, `head-input=`, `parent=` and `parent-input=` for `$GITHUB_OUTPUT`. It exits 1 when a name does not resolve.
import { spawnSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { InputError } from "./inputs.ts";

/** The head of a gate when the input names no head: the checkout. */
export const DEFAULT_HEAD = "HEAD";
/** A full hash of a commit: 40 lowercase hex digits. */
export const FULL_HASH = /^[0-9a-f]{40}$/;
/** A name of a commit has only letters, digits and `. _ / ~ ^ @ -`, and its first character is not `-`. */
const NAME = /^[A-Za-z0-9._/~^@][A-Za-z0-9._/~^@-]*$/;

/** One commit of a gate: the input text and its full hash. */
export interface GateCommit {
  /** The text of the input, or the text of its default. */
  readonly input: string;
  /** The full hash of the commit. */
  readonly sha: string;
}

/** The two commits of a gate. */
export interface GateCommits {
  readonly head: GateCommit;
  readonly parent: GateCommit;
}

/** A function that gives the full hash of a name of a commit, or `null` when the name does not resolve. */
export type Resolver = (name: string) => string | null;

/**
 * This function resolves the head and the parent of a gate to full hashes.
 * An empty or absent head is `HEAD`. An empty or absent parent is `<head>^1`, with the input text of the head.
 * A name that does not resolve, a resolver that gives no full hash, or a parent that is the head throws an `InputError`.
 */
export function resolveCommits(inputs: { readonly head?: string | undefined; readonly parent?: string | undefined }, resolver: Resolver): GateCommits {
  const headInput = inputs.head?.trim() || DEFAULT_HEAD;
  const parentInput = inputs.parent?.trim() || `${headInput}^1`;
  const one = (role: string, input: string): GateCommit => {
    if (!NAME.test(input)) throw new InputError(`The ${role} "${input}" is not a name of a commit. A name has only letters, digits and . _ / ~ ^ @ -.`);
    const sha = resolver(input);
    if (sha === null) throw new InputError(`The ${role} "${input}" does not resolve to a commit (FAIL-CLOSED).`);
    if (!FULL_HASH.test(sha)) throw new InputError(`The ${role} "${input}" resolves to "${sha}", and that is not a full hash.`);
    return { input, sha };
  };
  const head = one("head", headInput);
  const parent = one("parent", parentInput);
  if (head.sha === parent.sha) throw new InputError(`The parent "${parentInput}" and the head "${headInput}" are the same commit ${head.sha}.`);
  return { head, parent };
}

/** This function gives a resolver that asks git in the folder `cwd`. Only a name of a commit resolves: a tree or a blob does not. */
export function gitResolver(cwd: string): Resolver {
  return (name) => {
    const out = spawnSync("git", ["rev-parse", "--verify", "--quiet", "--end-of-options", `${name}^{commit}`], { cwd, encoding: "utf8" });
    return out.status === 0 ? out.stdout.trim() : null;
  };
}

/** This function throws an `InputError` when a value of an option is not a full hash. The scripts of a gate take only full hashes. */
export function requireFullHash(option: string, value: string | undefined): string {
  if (value === undefined || !FULL_HASH.test(value)) throw new InputError(`The option ${option} takes a full hash of 40 hex digits, not "${value ?? ""}".`);
  return value;
}

/** This function gives the lines of the commits for the file `$GITHUB_OUTPUT`. */
export function outputLines(commits: GateCommits): string[] {
  return [`head=${commits.head.sha}`, `head-input=${commits.head.input}`, `parent=${commits.parent.sha}`, `parent-input=${commits.parent.input}`];
}

if (process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const args = process.argv.slice(2);
  const opt = (key: string): string | undefined => {
    const i = args.indexOf(key);
    return i >= 0 ? args[i + 1] : undefined;
  };
  try {
    const commits = resolveCommits({ head: opt("--head"), parent: opt("--parent") }, gitResolver(process.cwd()));
    console.log(outputLines(commits).join("\n"));
    console.error(`The head: ${commits.head.input} = ${commits.head.sha}. The parent: ${commits.parent.input} = ${commits.parent.sha}.`);
  } catch (e) {
    console.error(`::error::${(e as Error).message}`);
    process.exitCode = 1;
  }
}
