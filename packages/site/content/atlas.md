This page is the atlas of the solved regions. A region is one family of input boards on one guard measure of one step, in one screen set. The atlas shows the leader of each region and how long it holds.

## The map of the regions

Each grid is one step. The rows are the families, and the columns are the guard measures. Each cell is one region, with its leader in short form and a mark for its state.

- A cell with the mark ● is `solved`. One leader held the region for 4 weeks or more.
- A cell with the mark ◔ is `held`. The leader holds the region, but for less than 4 weeks.
- The word `base` tells that no strategy is better than the default of the step on that region. Then the default is the leader.
- The thin bar in a cell shows the days held, from 0 to 28.

Select a cell. The panel then shows the leader, the runner-up, the start of the run, the bound and the source run.

## The rules

The leader of a region in one week is the strategy with the greatest family mean among the rows with the sign 1. A positive mean tells that the strategy is better than the default of the step on that family. A sign of 1 tells that the difference is larger than the minimum effect.

- When no row has the sign 1, the default of the step is the leader.
- When two strategies have the same mean, the name that comes first in text order leads.
- The runner-up is the next entry in that order. After a single win, the default is the runner-up. When the default leads, the runner-up is the strategy with the greatest mean.

A region is solved when one leader holds it for 28 days or more. The days count from the first record of the latest unbroken run of records with the same leader, to the latest record. A region that is not in a record starts a new run after that record.

A region can also be solved by a bound: the leader is within a measured distance of a proven lower bound. That rule is a later slice. So each region tells "no bound yet", and no region is solved by a bound.

## The weekly records

Each week has one record. The record keeps the leader of each region of the committed [verdict snapshots](https://github.com/mark1russell7/highways/tree/main/docs/research/verdicts) at the end of its date in UTC.

- The first records are files in [`docs/research/atlas/`](https://github.com/mark1russell7/highways/tree/main/docs/research/atlas).
- The build derives each later week from the git history of `main`. It reads the snapshots of the last commit on that date. No person writes these records.
- The build of each Sunday adds the record of the Saturday before it. Each merge to `main` also updates this page.
- A past week does not change. The build compares each final week with the live page, and a change stops the deploy.
