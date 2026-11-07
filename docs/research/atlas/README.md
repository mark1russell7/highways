# The weekly records of the atlas

Each file `<date>.json` holds the leader of each region of the committed verdict snapshots on that date. The [atlas page](https://mark1russell7.github.io/highways/atlas.html) of the site reads all the records at build time.

No person writes the weekly record. The build of the site derives each week after the newest file of this folder from the git history. The section [The derived weeks](#the-derived-weeks) tells how.

## The fields

- The record has `format`, `date` and `regions`. The format is `atlas-week/1`.
- A region is one family of one guard measure of one step, in one screen set. Each line of `regions` is one region.
- Each region has `set`, `step`, `base`, `guard`, `measure`, `family`, `leader`, `runnerUp`, `run` and `core`.
- `leader` and `runnerUp` each have `strategy`, `mean` and `n`. `mean` is the family mean against `base`. A positive mean tells that the strategy is better. The base itself has the mean 0.
- `runnerUp` is `null` when the region has no other entry.
- `run` is the run of the workflow `Screen` of the snapshot. `core` is the core of its stamp `verified`, or else the core of its run.
- The regions are in the text order of set, step, guard, measure and family. So two writes from the same snapshots give the same bytes.

## The rules

- The leader is the strategy with the greatest family mean among the rows with the sign 1. An equal mean goes to the name that comes first in text order.
- When no row has the sign 1, the base is the leader.
- The runner-up is the next entry in that order. After a single win, the base is the runner-up. When the base leads, the runner-up is the strategy with the greatest mean.
- A region is `solved` when one leader holds it for 28 days or more. Else it is `held`.
- The days count from the first record of the latest unbroken run with the same leader, to the latest record.
- A region that is not in a record starts a new run after that record.
- The rule of the proven lower bound is a later slice. Each region tells "no bound yet".

## The derived weeks

The build of the site (`packages/site/src/atlas-history.ts`) makes the records after the newest file of this folder:

- The first date is 7 days after the newest file. Each next date is 7 days later. The last date is at or before the build date in UTC.
- For each date, the build finds the last commit of `main` at or before `<date>T23:59:59Z`. It starts `git rev-list --first-parent -1 --before=<date>T23:59:59Z HEAD`.
- The option `--before` compares the committer date. A rebase keeps the old author date, so the author date does not count.
- The first-parent history is the sequence of merges to `main`. A commit of a branch counts only after its merge.
- The build reads the snapshot files of that commit with `git ls-tree` and `git cat-file`. It makes the record with `weekFromFiles`, the same function as the script `atlas-week.ts`.
- The rules `non_fast_forward` and `deletion` of `main` stop a change of the history. So a derived week stays the same.

The Pages workflow starts each Sunday at 01:32 UTC. So the record of each Saturday is on the page soon after the end of that day.

### The file of the weeks and the gate

The build writes `atlas-weeks.json` to the site. Each week has its date, its source, the commit that the build read, the value `final` and the SHA-256 of its text.

- The source is `committed` for a file of this folder, or `derived` for a week of the history.
- A derived week is final when the history of the build has a commit after the end of its date. A committed week is always final.
- The build fetches the live `atlas-weeks.json`. Each final week of the live file must have the same SHA-256 in the build. Else the build fails.
- A 404 passes only at the first deploy: the live `atlas.html` answers 200 and has no link to `atlas-weeks.json`. Each other answer fails the build.
- For a local build with no network, set `ATLAS_LIVE_CHECK=off`. CI does not set it.
- To see a derived week before its date, set `SITE_BUILD_DATE=<YYYY-MM-DD>` for the build.

A checkout with no full history does not stop the build. Each week that the build cannot derive goes to `skipped` with its reason, and the page shows it.

## The gate test

The test `atlas-history.test.ts` derives the week of the newest file of this folder at the commit that added the file. It expects the same bytes as the file. So the derivation and the script give the same record.

## A record by hand

The script writes a record from the snapshots on disk. The weekly sequence does not need it. It is for a first record of a new folder, or for a test:

```sh
node packages/site/scripts/atlas-week.ts --date <YYYY-MM-DD>
```

- The default date is today in UTC.
- The script does not write over a record that exists. To write a record again after a change of a snapshot, remove the file first.
- A new file moves the start of the derived weeks. Then the gate of the build fails for each derived week that the file removes from the page.
