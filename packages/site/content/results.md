This page shows the committed results of the screens. The build reads them from the repository, so each merge to `main` updates this page.

## The verdicts

Each cell is the verdict of one strategy against the default `shared` on one guard measure. The family is the unit of the verdict.

- `better` and `worse` count only when they hold under both weightings, with the level 0.05.
- `depends on the mix` tells that the two weightings do not agree.
- `no verdict` tells that the difference is in the tie, or that the test does not decide.
- The breadth tells how many families are against the side of the verdict, for example "worse on 2 of 6".
- The small marks are the families: a plus is a win, a minus is a loss and a dot is a tie.

The screen sets are `screen-v1`, `screen-v2` and `screen-v3`. `screen-v1` and `screen-v2` have 6 families. Thus a sign test passes only at 6 of 6. `screen-v3` has 15 families, and a sign test passes at 12 of 15 (CORPUS-FAMILIES).

Select a cell to see its families. The snapshots are in [`docs/research/verdicts/`](https://github.com/mark1russell7/highways/tree/main/docs/research/verdicts).

## Where no single default wins

These verdicts are `better`, but 1 or more families are against them. On these families, the default stays better. A selector that knows the family can take the best strategy for each input.

## The ideas

The [idea catalog](https://github.com/mark1russell7/highways/blob/main/docs/research/CATALOG.md) has a record for each idea. The screen keeps an idea or drops it. A kept strategy or option is off by default, so the default routes do not change.

## The build queue

The queue puts each idea that is not built in the order of its score. The score is the expected gain times the uncertainty, divided by the cost. The builds take the ideas from the top. A blocked idea waits for a step, a measure or an other idea.

An enabler is an item that removes a block. Its score is the sum of the scores of the ideas that it unblocks, divided by its cost. The enablers and the ideas are on one list. The back test compares the predicted gain with the measured gain of the ideas that are built. The [catalog](https://github.com/mark1russell7/highways/blob/main/docs/research/CATALOG.md#the-build-queue) tells the formula, and [`queue.json`](https://github.com/mark1russell7/highways/blob/main/docs/research/queue.json) has all the rows.

## The measures

Each record of a screen has a value for each measure of its step. The verdicts compare these values. The table shows the definition of each measure that has one in the core. The column headers of the verdicts show it too. [`MEASURES.md`](https://github.com/mark1russell7/highways/blob/main/docs/research/MEASURES.md) has the definition of each measure id.

## What is new

The last items of the [roadmap](https://github.com/mark1russell7/highways/blob/main/docs/ROADMAP.md), the newest first.
