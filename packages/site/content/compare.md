Choose a step and a board. Each strategy of the step runs on the same board, and each panel shows its output and its measures. The page has each step of the pipeline: `group`, `router`, `highway`, `curve` and `room`. The boards have made-up data.

## How to read the panels

- The registry `STRATEGIES` gives the panels. A new strategy gets its panel with no change to this page.
- Each option with a range gets a control. An option without a range, for example a rule or a list, keeps its default, and the page shows the default as text.
- Each measure comes from the measure suite of the benchmark (`runSuite`), with the same keys.
- A star marks the best value of each measure. A strategy that breaks a hard rule gets no star.
- A green border marks a strategy on the Pareto front of the step. No other strategy is better on each axis of the front.
- The panels of the steps `router` and `curve` open each shared way into one lane for each edge.
- The step `curve` draws the lanes of the router `shared` with each curve. The curve `highway` bends the lanes of a bundle as one, so its options `minRadius`, `jog` and `jogPieces` change the bends.
- Each card of an example board has a group key in `data.group`. The grouping rule `keys` makes one group for each key.
- The step `group` routes the board with the router `sections` on the tree of each grouping rule. The panel shows the groups and the links of the far view.
- The step `highway` makes the plan of each highway strategy, and `follow` routes the edges along the plan, as in the screen. The panel shows the routes.
- The step `room` opens the gaps of the board with each room strategy. The panel shows the open board and the links of the far view. The board "Packed grid" is packed: its boxes touch, as after a host layout. On a board with wide gaps, a gap opens only when its links need more room.
- The step `highway` has more than 50 strategies, so it runs for some seconds. The line of the status shows the progress after each strategy and the slowest strategies.
- A worker in your browser runs the strategies, so the time is the time on your device.
- The link of the page keeps the step, the board and the options. Send it, and the same view opens.
