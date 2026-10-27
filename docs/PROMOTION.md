# The promotion rule

This note tells when a kept option becomes a default, and when a selector picks it for each input. The screen of an idea ([CATALOG](research/CATALOG.md)) keeps or drops the idea. A kept idea is an option that is off by default. It changes no view until the promotion rule makes it a default.

This rule is the shared rule of three projects:

- `highways` promotes its routing options with it.
- `packing` promotes its strategies and options with it, with its own measures and hard rules.
- `layout-stack` owns the joint selector. The joint selector uses this rule by reference, with its own guards, hard rules and cells (refer to [The joint selector](#the-joint-selector)).

A change of this rule is a change of this note. The three projects agree on the change first.

## The steps of a promotion

1. **The candidate.** The idea has the verdict `kept` in the catalog. Its option or strategy is in a release.
2. **The prediction.** Write the prediction before the promotion screen. It names the measures, the values that it expects and its confidence. The screen writes the prediction id in each record.
3. **The promotion screen.** Screen the candidate and the current default on the same inputs and seeds, in CI. The inputs are the promotion corpus (refer to [The corpus](#the-corpus)).
4. **The win test.** Apply the tests of [The win test](#the-win-test) to the promotion corpus. All tests must pass.
5. **The confirmation.** When the win test passes, screen the candidate again on fresh seeds (refer to [The confirmation run](#the-confirmation-run)). The win test must pass again.
6. **The decision.** The option becomes the default when the test passes on the full corpus. When it passes only on some cells, the option becomes a rule of the selector (refer to [The selector](#the-selector)). Otherwise, the option stays off.
7. **The release.** A change of the default output (routes or placements) is MINOR before 1.0.0. The same PR updates the digest tests and names the screen run. The hosts get a message before the release.

## The corpus

- The promotion corpus is every input of the current screen sets, with all their seeds.
- Each step names its time fixtures. For `highways`, the bench fixtures up to 1000 nodes give the times. For `packing`, the fixtures go up to 10 000 items.
- The decision uses holdout seeds: seeds that the screen of the idea did not use. The generators of the shared corpus (CORPUS) make them.
- `packing` makes its holdout seeds with its generators (`@mark1russell7/packing` 0.1.4 and later).
- For `highways`, until CORPUS is in the screen, the holdout is the inputs of `screen-v1` outside the decision boards of the idea.

## The paired ratio

All tests use paired ratios. For each input and seed, the ratio of a measure is the value of the candidate divided by the value of the default. The two values come from the same input and the same seed.

- A ratio is "worse" in the direction of the measure. For a measure where less is better, a ratio of 1.02 is 2% worse. For a measure where more is better, the test uses the inverse ratio.
- When both values are 0, the ratio is 1.
- A median of a measure is the median of its ratios, not a ratio of two medians. Thus the verdict does not change with the scale of the inputs.

### The floor rule

Some measures have a floor: the best value that the measure can have. A measure with a floor of 0 gives no ratio when the default is at the floor. For example, a default with no merges has a largest merge angle of 0. Then each merge of the candidate is a loss without limit.

- When the default is at the floor of a measure on an input, that input uses an absolute tolerance in place of the ratio.
- The candidate is within the tolerance when its value minus the floor is at most the tolerance. Then the input is a tie, and its ratio is 1.
- Otherwise, the ratio of the input is +Infinity. It is not a veto. It goes into the median, the tail and the sign test as each other ratio does.
- The sign test drops each tie. The record counts the ties in the inputs where the floor rule applied.
- A win measure at the floor cannot win on that input. The default is at its best value, so the candidate can only tie or lose.
- Each measure has its own floor and tolerance, as two named parameters in [The floors](#the-floors). A measure that is not in that table has a tolerance of 0.
- A count has a tolerance of 0. Thus a count above 0 is beyond the tolerance.
- The record of the test names, for each measure, the inputs where the floor rule applied.

A floor that is not 0 keeps the ratio, because the ratio has a value there. For example, `B3` has a floor of 1. A ratio of 1.09 at that floor is a real stretch of 9%, so the ratio test applies.

## The win test

The test compares the candidate with the current default on each input of the corpus. The guard measures are the measures of the step in [The measures of each step](#the-measures-of-each-step). The win measures are the measures that the record of the idea names in `wins`.

| Test | Rule |
|---|---|
| Hard rules | On each input, each hard count of the candidate is at most that of the default. Two runs give the same output. |
| Median | For each guard measure, the median ratio is at most `1 + medianWorse`. |
| Tail | For each guard measure, at most a `tailShare` of the inputs have a ratio above `1 + tailWorse`. |
| Gain | One win measure has a median ratio of `1 - gainMin` or better. The sign test and the bootstrap of [The noise guard](#the-noise-guard) pass for it. |
| Time | The median time ratio is at most `timeRatio`. The `timeTailQ` quantile of the time ratio is at most `timeTail`. The large bench fixtures stay in their CI time limit. |
| Stability | On the base and change pairs of the corpus, each stability measure is a guard measure. It passes the median and tail tests. |

CI does the time test, because other jobs on a local machine change the times.

### The noise guard

The screens test many ideas on one corpus, so some ideas pass by chance. The gain test has two guards against chance:

1. **The sign test.** Count the inputs where the win measure is better and the inputs where it is worse. Ties do not count. A one-sided sign test on these counts gives a p-value below `signP`.
2. **The paired bootstrap.** On the holdout inputs, take `bootstrapRuns` samples of the inputs, with replacement, from a fixed seed. Calculate the median ratio of each sample. The `bootstrapLevel` interval of these medians does not include 1. The statistic is the median, not the mean, so a ratio of +Infinity does not make the interval endless. The median of the log ratios gives the same interval.

The sign test replaces a fixed share of better inputs. A share of 60% of 20 inputs is not a signal, but 60% of 2000 inputs is a strong signal.

### The confirmation run

The program screens approximately 250 ideas. At a p-value of 0.05, approximately 12 ideas can pass by chance. The confirmation run controls this, and it also finds an option that fits only the corpus.

- The generators make a fresh set of inputs after the win test passes. No screen used these seeds before.
- The fresh set has `confirmInputs` or more inputs, in the same cells as the corpus.
- For a rule of the selector, the fresh set has `cellMin` or more inputs in each cell of the rule.
- The candidate passes the full win test on the fresh set, with the same parameters.
- The record of the promotion names the fresh seeds. A later screen does not use them for a decision.

## The measures of each step

The ids are the ids of [the measure note](research/MEASURES.md). The ids of the `pack` measures are the ids of the [packing measure note](https://github.com/mark1russell7/packing/blob/main/docs/MEASURES.md).

| Step | Guard measures |
|---|---|
| `router` | `R1`, `R4`, `R5` q0.95, `R11` min, `B1` |
| `highway` | `R1`, `B1`, `B3` q0.95, `B6` max |
| `curve` | `C3`, `C5`, `C7`, `C8` max |
| `room` | `R1`, `R12` |
| `group` | `Z4`, `Z5`, `Z6`, `Z9` |
| `pack` | `pack.area`, `pack.fill`, `pack.aspectError`, `pack.order.inversions` |
| `pack`, in fixed cells | `pack.overflow` |
| `pack`, on change pairs | `pack.stability.mean`, `pack.stability.q95`, `pack.stability.moved` |
| all routing steps, on change pairs | `Z10` |

For `pack`, `pack.deterministic` and the hard rules give the hard-rule test. `pack.search.ms` gives the time test.

## The selector

- The selector is a strategy that picks an option for each input. It reads only the cells of the input that are known before the step. The cells are `edgeDensity`, `edgeShape`, `groups` and `ports`, and the cells of the packer.
- A rule of the selector is a cell and an option. The win test must pass on the inputs of that cell, with `cellMin` or more inputs in the cell.
- A cell with fewer inputs gets more inputs from the generators before the decision.
- **The regret.** For each input, the oracle is the best option for that input. The regret of the selector is the median gap between its option and the oracle. A new rule must decrease the regret of the full selector on the full corpus. Thus many small wins in cells do not make a worse selector.
- **The flip rate.** Two inputs that are near the same, at the two sides of a cell edge, can get different options. Then the view jumps. The flip rate is the share of the change pairs where the option changes. A new rule keeps the flip rate at most `flipRate`.
- The selector is off by default. Its first rule makes a later item (SELECT).

## The joint selector

`layout-stack` owns the joint selector and its docs. Its docs refer to this note and do not copy it.

- The guards are the `joint.*` measures, the `pack.*` guards and the `route.*` guards.
- The `pack.*` guards are `pack.area`, `pack.fill`, `pack.aspectError` and `pack.order.inversions`.
- The hard rules are the rules of the two stages, with the `tolerance` field of each record.
- The cells are only the cells known before the placement. They are the dimensions of the packing taxonomy and the routing cells that do not use positions. These routing cells are `edgeDensity`, `edgeShape`, `groups` and `ports`.
- The parameters are the parameters of this note.

## The parameters

Each threshold is a named parameter. A change of a value is a measured decision, as for a promotion. It has a prediction, a screen and a reason in this note.

| Parameter | Value | Test |
|---|---|---|
| `medianWorse` | 0.02 | Median |
| `tailWorse` | 0.10 | Tail |
| `tailShare` | 0.10 | Tail |
| `gainMin` | 0.05 | Gain |
| `signP` | 0.05 | Gain |
| `bootstrapRuns` | 10000 | Gain |
| `bootstrapLevel` | 0.95 | Gain |
| `timeRatio` | 1.5 | Time |
| `timeTailQ` | 0.95 | Time |
| `timeTail` | 2.0 | Time |
| `cellMin` | 10 | Selector |
| `flipRate` | 0.05 | Selector |
| `confirmInputs` | 200 | Confirmation |

## The floors

Each row gives two named parameters: `<measure>.floor` and `<measure>.tol`. These values were written on 2026-10-27, before the first promotion screen.

| Floor parameter | Tolerance parameter | Reason |
|---|---|---|
| `R1.floor` = 0 | `R1.tol` = 0 | A new crossing is a loss. |
| `B6.floor` = 0 | `B6.tol` = 60 degrees | The default model of `shared` merges at approximately 60 degrees. A merge at that angle is not a loss. The guard is the max of `B6`. |
| `pack.order.inversions.floor` = 0 | `pack.order.inversions.tol` = 0 | A count. `packing` asks that each new inversion fails. |
| `pack.overflow.floor` = 0 | `pack.overflow.tol` = 0 | A count. An item outside a fixed container is a loss. |
| `pack.stability.moved.floor` = 0 | `pack.stability.moved.tol` = 0.02 | On a small change, the default often moves no item. A move of 1 item in 100 is not a loss. |
| `pack.stability.mean.floor` = 0 | `pack.stability.mean.tol` = 0.005 container widths | The default often moves no item. |
| `pack.stability.q95.floor` = 0 | `pack.stability.q95.tol` = 0.01 container widths | The default often moves no item. |
| `pack.aspectError.floor` = 0 | `pack.aspectError.tol` = 0.01 (natural log) | An exact tiling gives the default an error of 0. The tolerance is approximately 1% of the aspect. |

The four tolerances of `pack.stability` and `pack.aspectError` are first values of `packing`. The records of the floor rule give the data to measure them later.

## The order of promotions

- Promote one option at a time. After each promotion, the screen compares the next candidate with the new default.
- Two kept options of one step can change each other. Screen such a pair as a stack too, before the second promotion.

## Demotion

A later corpus can show that a default fails the win test against the option that it replaced. Then the old default comes back, with the same steps. The change of the default output is MINOR.

## The record of a promotion

The record of the idea in the catalog gets a field `promotion`. It holds the date, the prediction id and the screen run. It also holds the result of each test and the decision. The roadmap gets a row.
