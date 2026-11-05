# The verdict snapshots

Each file `<set>-<step>.json` holds the verdicts of one screen against the default of its step. `STEP_BASE` of `screen-verdict.ts` gives the defaults. The [results page](https://mark1russell7.github.io/highways/results.html) of the site reads these files at build time.

## The fields

- The header has `set`, `step`, `base`, `level`, `run`, `commit`, `date` and `core`. A snapshot from VERDICT-RUN on also has `script`, the commit of the script.
- `run` is the id of the run of the workflow `Screen` that gave the records. `commit` is the commit of the records.
- `core` is the version of `@mark1russell7/highways` at that commit.
- Each line of `rows` is one verdict: a strategy on a guard measure, with its label, its families and its breadth.
- The rows are the built-in strategies of the step at the checkout, without the default. On the 15 screens of 2026-11, this rule gives 1,137 of 1,500 rows exactly.
- `verified` is the stamp of the last read on a later core with the same rows. It has `core`, `run`, `commit` and `date`. The rows stay those of the first run.
- A snapshot with a router that has no lanes also has `limits`. Each line gives the rise of B11 over `corners` on one input, the limit and the label.

## How to make a snapshot

The job `screen` of the workflow `Screen` writes `verdict.json` for a screen of a whole step. To commit it, copy it to `<set>-<step>.json`.

To make a snapshot by hand:

1. Find the id of a finished run of the workflow `Screen`.
2. Download its artifact into a new empty folder: `gh run download <run> -D <dir>/<run>`.
3. In `packages/core`, start `node scripts/screen-verdict.ts <dir>/<run>/<artifact>/screen.jsonl --snapshot`.

- The script takes the run and the commit from the path of the artifact. `--run` and `--commit` set them.
- `--date` sets the date. The default is today.
- `--core` sets the version of the core. The default is the version of the checkout.
- `--default` sets the default. The default of each step is in `STEP_BASE`.
- `--all-json <file>` writes the rows of each strategy of the records, also the opt-in strategies.
- `--check <snapshot>` reads the rows of a snapshot again from these records. A moved label or a missing row gives the exit code 1.

## How to read a snapshot on a later core

A new release can leave the verdicts as they are. A read on the new core tells if they changed.

1. Start the workflow `Screen` on the same set and step. The job writes `verdict.json`.
2. Download the artifact into a new empty folder.
3. From the root, start `node packages/site/scripts/verdict-verify.ts docs/research/verdicts/<set>-<step>.json <dir>/verdict.json --stamp`.

- The script compares the fields of each row that the page shows: the label, the plain sign, the means, `p`, the families and the breadth.
- With the same rows, it writes the stamp `verified`. Commit the stamp. The page then tells "measured on" the first core and "verified on" the new core.
- With a row that differs, it gives the exit code 1 and each row. Then make a new snapshot with its rows, by the rule below.
- The measure `results-unread` of `kpi.json` counts the snapshots with no read on the minor of the engine. `results-lag` counts the minors from the oldest run, and it ignores the stamps.

## The rule

Each item that changes a strategy, a measure, a verdict or a corpus commits its new snapshots in the same pull request. The site then shows the new verdicts after the merge.

An item that screens an idea also starts `pnpm queue` and commits `docs/research/queue.json` in the same pull request.

## The full rows

The folder [`all/`](all/) holds the rows of each strategy of the 15 screens of the page, 1,500 rows. Each file has the run and the commit of its snapshot.

## The opt-in strategies

The folder [`opt-in/`](opt-in/) holds the verdicts of the opt-in routers that a build took from the queue. Each file has the form of a snapshot, with the rows of those routers only.

- Only the measured gain of `pnpm queue` reads these files. The results page does not read them.
- Make the file with `--snapshot`, then keep only the rows of the opt-in routers.

## The remeasures

The folder [`remeasure/`](remeasure/) holds the record `remeasure.json` of each run of the workflow `Remeasure`. Each record has the 5 jobs, their A/A floors and their CPU models.

- `h3.json` is run 41369331158. `portfolio-speed.json` is run 41455276356, in mode `fresh`. `route-scale.json` is run 41382862417.
- The results page does not read these files. The [roadmap](../../ROADMAP.md) gives the verdicts.

## The benchmark snapshot

The folder [`../bench/`](../bench/) holds `bench.json` and `bench-meta.json` of one run of the workflow `Bench`. The Pages build copies them into the site and does not start the benchmark. To make a new snapshot, download the artifact `bench-<sha>` of a finished run on `main`. Then write its rows into `bench.json`, one row on each line, and its run, commit and date into `bench-meta.json`.
