# The verdict snapshots

Each file `<set>-<step>.json` holds the verdicts of one screen against the default `shared`. The [results page](https://mark1russell7.github.io/highways/results.html) of the site reads these files at build time.

## The fields

- The header has `set`, `step`, `base`, `level`, `run`, `commit`, `date` and `core`.
- `run` is the id of the run of the workflow `Screen` that gave the records. `commit` is the commit of the records.
- `core` is the version of `@mark1russell7/highways` at that commit.
- Each line of `rows` is one verdict: a strategy on a guard measure, with its label, its families and its breadth.

## How to make a snapshot

1. Find the id of a finished run of the workflow `Screen`.
2. Download its artifact into a new empty folder: `gh run download <run> -D <dir>/<run>`.
3. In `packages/core`, start `node scripts/screen-verdict.ts <dir>/<run>/<artifact>/screen.jsonl --snapshot`.

- The script takes the run and the commit from the path of the artifact. `--run` and `--commit` set them.
- `--date` sets the date. The default is today.
- `--core` sets the version of the core. The default is the version of the checkout.

## The rule

Each item that changes a strategy, a measure, a verdict or a corpus commits its new snapshots in the same pull request. The site then shows the new verdicts after the merge.

An item that screens an idea also starts `pnpm queue` and commits `docs/research/queue.json` in the same pull request.

## The opt-in strategies

The folder [`opt-in/`](opt-in/) holds the verdicts of the opt-in routers that a build took from the queue. Each file has the form of a snapshot, with the rows of those routers only.

- Only the measured gain of `pnpm queue` reads these files. The results page does not read them.
- Make the file with `--snapshot`, then keep only the rows of the opt-in routers.

## The benchmark snapshot

The folder [`../bench/`](../bench/) holds `bench.json` and `bench-meta.json` of one run of the workflow `Bench`. The Pages build copies them into the site and does not start the benchmark. To make a new snapshot, download the artifact `bench-<sha>` of a finished run on `main`. Then write its rows into `bench.json`, one row on each line, and its run, commit and date into `bench-meta.json`.
