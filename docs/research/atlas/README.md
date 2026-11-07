# The weekly records of the atlas

Each file `<date>.json` holds the leader of each region of the committed verdict snapshots on that date. The [atlas page](https://mark1russell7.github.io/highways/atlas.html) of the site reads all the records at build time.

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

## How to write the next record

Write one record each week, from the root of the repository:

```sh
node packages/site/scripts/atlas-week.ts --date <YYYY-MM-DD>
```

- The default date is today in UTC.
- The script does not write over a record that exists. To write a record again after a change of a snapshot, remove the file first.
- Commit the new record. The test `atlas-data.test.ts` compares the latest record with the snapshots that it read.
