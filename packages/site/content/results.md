This page shows the committed results of the screens. The build reads them from the repository, so each merge to `main` updates this page.

## The verdicts

Each cell is the verdict of one strategy against the default `shared` on one guard measure. The family is the unit of the verdict.

- `better` and `worse` count only when they hold under both weightings, with the level 0.05.
- `depends on the mix` tells that the two weightings do not agree.
- `no verdict` tells that the difference is in the tie, or that the test does not decide.
- The breadth tells how many families are against the side of the verdict, for example "worse on 2 of 6".
- The small marks are the families: a plus is a win, a minus is a loss and a dot is a tie.

Select a cell to see its families. The snapshots are in [`docs/research/verdicts/`](https://github.com/mark1russell7/highways/tree/main/docs/research/verdicts).

## Where no single default wins

These verdicts are `better`, but 1 or more families are against them. On these families, the default stays better. A selector that knows the family can take the best strategy for each input.

## The ideas

The [idea catalog](https://github.com/mark1russell7/highways/blob/main/docs/research/CATALOG.md) has a record for each idea. The screen keeps an idea or drops it. A kept strategy or option is off by default, so the default routes do not change.

## What is new

The last items of the [roadmap](https://github.com/mark1russell7/highways/blob/main/docs/ROADMAP.md), the newest first.
