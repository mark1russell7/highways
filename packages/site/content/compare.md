Choose a step and a board. Each strategy of the step runs on the same board, and each panel shows its output and its measures. The boards have made-up data.

## How to read the panels

- The registry `STRATEGIES` gives the panels. A new strategy gets its panel with no change to this page.
- Each measure comes from the measure suite of the benchmark (`runSuite`), with the same keys.
- A star marks the best value of each measure. A strategy that breaks a hard rule gets no star.
- A green border marks a strategy on the Pareto front of the step. No other strategy is better on each axis of the front.
- The panels of the steps `router` and `curve` open each shared way into one lane for each edge.
- The step `curve` draws the lanes of the router `shared` with each curve. The curve `highway` bends the lanes of a bundle as one, so its options `minRadius`, `jog` and `jogPieces` change the bends.
- Each card of an example board has a group key in `data.group`. The grouping rule `keys` makes one group for each key.
- The step `group` routes the board with the router `sections` on the tree of each grouping rule. The panel shows the groups and the links of the far view.
- A worker in your browser runs the strategies, so the time is the time on your device.
- The link of the page keeps the step, the board and the options. Send it, and the same view opens.
