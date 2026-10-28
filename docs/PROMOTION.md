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
- Each measure has its own floor and tolerance, as two named parameters. [The floors](#the-floors) gives them or names their source. A measure without them has a tolerance of 0.
- A count has a tolerance of 0. Thus a count above 0 is beyond the tolerance.
- The record of the test names, for each measure, the inputs where the floor rule applied.

A floor that is not 0 keeps the ratio, because the ratio has a value there. For example, `B3` has a floor of 1. A ratio of 1.09 at that floor is a real stretch of 9%, so the ratio test applies.

### The per-input classification

The sign test, the wins and the flips put each input, or each board, in one of three classes: `"better"`, `"worse"` or `"tie"`. A change smaller than the resolution of a measure is noise, not a result. Thus the classification uses a minimum effect.

- `MeasureSpec` gets an optional field `minEffect?: number | { rel: number }`. It is separate from `tol`. `tol` is the slack above a floor, and it can be much larger than the resolution. For example, `B6.tol` is 60 degrees.
- The threshold, with `m = spec.minEffect ?? 0`, is `threshold(a, b) = max(RECORD_EPS, typeof m === "number" ? m : m.rel * max(|a|, |b|))`.
- A non-finite `rel` product falls back to `RECORD_EPS`.
- The threshold scales with the two values, not with the baseline alone. Thus the rule is symmetric.
- `compareMeasure(a, b, spec)`, with `a` the candidate and `b` the baseline, gives `"tie"` when `|a − b| ≤ threshold(a, b)`.
- `compareMeasure` compares on the grid of the records. `A = Math.round(a × RECORD_SCALE)` and `B = Math.round(b × RECORD_SCALE)` are integers, as in the rounding of the records.
- On the grid, the threshold is `t = max(1, m × RECORD_SCALE)`, or `max(1, m.rel × max(|A|, |B|))`. A tie is `|A − B| ≤ t + 1e-6`.
- Thus the replay of a rounded record gives the same class as the live values.
- An infinite value, or a value outside the safe integers of the grid, uses the threshold of the bullet above.
- Otherwise, `compareMeasure` gives `"better"` or `"worse"` by `spec.direction`.
- Two equal `Infinity` values are a tie. `compareMeasure` refuses `NaN`.
- The rule is symmetric: a loss smaller than the threshold is a tie, not a loss.
- A tie does not count as a win.
- The hard-rule counts stay exact. Each new hard break is a loss.

The tie applies only to the classification of each input and each board: the sign test, the wins and the flips. The median test, the tail test and the bootstrap read the raw values. Thus a steady loss below the resolution on each input still shows in the median test.

[The minimum effects](#the-minimum-effects) gives the value of `minEffect` for each measure of `highways`.

## The win test

The test compares the candidate with the current default on each input of the corpus. The guard measures are the measures of the step in [The measures of each step](#the-measures-of-each-step). The win measures are the measures that the record of the idea names in `wins`.

| Test | Rule |
|---|---|
| Hard rules | On each input, each hard count of the candidate is at most that of the default. Two runs give the same output. |
| Median | For each guard measure, the median ratio is at most `1 + medianWorse`. |
| Tail | For each guard measure, at most a `tailShare` of the inputs have a ratio above `1 + tailWorse`. |
| Gain | One win measure has a median ratio of `1 - gainMin` or better. The sign test and the bootstrap of [The noise guard](#the-noise-guard) pass for it. |
| Time | The time ratio of an input is `t / max(b, timeFloorMs / timeRatio)`, with `t` the time of the candidate and `b` the time of the default. The median time ratio is at most `timeRatio`. The `timeTailQ` quantile of the time ratio is at most `timeTail`. The large bench fixtures stay in their CI time limit. |
| Stability | On the base and change pairs of the corpus, each stability measure is a guard measure. It passes the median and tail tests. |

Thus a candidate with a time of `timeFloorMs` or less passes the median test. Such a time is too small to be a cost to the user.

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

### Activation

A candidate is "exercised" on an input when one of these conditions is true:

- Its own move count is more than 0. The record keeps the count as the trace measure `move.<name>`.
- It has a base, and its `outputHash` on the input is different from the `outputHash` of the base.

The base of an option is the same strategy without the option. The base of a highway finder is the same step with no highway. A packing strategy of the zoo has no base.

A verdict counts only when the candidate is exercised on one or more decision inputs. Otherwise the verdict is `not-exercised`, with a reason. The idea then goes back to be built again. It does not go to dropped.

### Distinctness

Candidates with the same `outputHash` on each decision input make one "output group". The group id is the first candidate id in sort order. A group counts as one candidate in the counts of a wave and of a portfolio. The verdict of the group applies to each member.

A "cell group" has the same `outputHash` on each input of one cell. Only a selector rule uses a cell group: in that cell, its members are one option. The screen shows the cell groups as diagnostics.

### The output hash

The `outputHash` of a record is the first 16 hexadecimal digits of the SHA-256 of the canonical JSON of the output. `outputHash` of layout-contract calculates it. Each stage sets the canonical form of its output:

- highways rounds each number to the grid of `RECORD_EPS`, and changes -0 to 0. Two code paths can give the same routes with different float noise.
- packing rounds each number of the placements to the grid of `RECORD_EPS` (3 decimals), and changes -0 to 0. It sorts the placements by id.
- The joint runner of layout-contract hashes the list of 2 hashes: the `outputHash` of the pack, then the `outputHash` of the routes. Each part uses the form of its stage.

Groups compare hashes only in one stage. A number near a rounding boundary can split a group, and then a real copy counts two times. Two outputs with the same rounded hash have each number in one grid step of the other.

### Deterministic defaults

A default is deterministic. A portfolio limits its work by the member count and the input size, not by the wall time. A time budget is only an opt-in ceiling. A cut by the budget makes the output depend on the speed of the machine, so the record is not deterministic.

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

### A bound by count

On mixed sizes, a lower bound by count is weak. It drops the largest items first, but a packer leaves out many small items. On the screen 3 of packing, the count bound was 1.5% of the overflow count. The area bound was 42% to 62% of the overflow area. Judge an overflow by the area excess (`pack.overflow.excessArea`), not by the count excess.

The `pack` step ranks its strategies in each cell in two levels. In a cell with a free size, the area excess is 0, thus `pack.fill` decides.

1. Rank by the area excess, with its `minEffect`.
2. Compare `pack.fill` only between the strategies with a tie on the area excess. Use only the inputs that each compared strategy packs with no overflow. A cell is "thin" when these shared inputs are less than 30% of the cell.

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
| `timeFloorMs` | 5 | Time |
| `cellMin` | 10 | Selector |
| `flipRate` | 0.05 | Selector |
| `confirmInputs` | 200 | Confirmation |

## The floors

Each row gives two named parameters: `<measure>.floor` and `<measure>.tol`. These values were written on 2026-10-27, before the first promotion screen.

| Floor parameter | Tolerance parameter | Reason |
|---|---|---|
| `R1.floor` = 0 | `R1.tol` = 0 | A new crossing is a loss. |
| `B6.floor` = 0 | `B6.tol` = 60 degrees | The default model of `shared` merges at approximately 60 degrees. A merge at that angle is not a loss. The guard is the max of `B6`. |

## The minimum effects

`MIN_EFFECTS` of `bench/screen/measures.ts` gives the `minEffect` of each measure of `MEASURES` by its unit. These values were written on 2026-10-28 (WIN-RES).

| Units | `minEffect` | Reason |
|---|---|---|
| `0 to 1`, `-1 to 1`, `-0.5 to 1`, `share of the gap`, `0 or 1` | none, so `RECORD_EPS` | A share or a flag of 0 or 1 has the precision of a written file. |
| `ratio`, `IQR over the median`, `no unit`, `half turns for each route`, `curvature times the unit of the board` | none, so `RECORD_EPS` | A stretch or another value without a unit has the precision of a written file. |
| `count`, `count for each edge`, `count for each route` | 0, so `RECORD_EPS` | A count changes in steps. A change of 1 counts. |
| `units`, `units of the board` | `{ rel: 0.01 }` | A length in pixels moves with each small move of a point. A change of 1% or less is not visible. |
| `degrees` | `{ rel: 0.01 }` | An angle is a continuous value of the geometry, as a length. |

The time test uses its own ratios (`timeRatio` and `timeTail`), so the times have no row.

`highways` imports `compareMeasure` and `minEffectOf` from the contract `@mark1russell7/layout-contract` (0.2.7 or later). The contract has no dependencies, so the import adds only the contract to the core. A test checks that the functions agree with this note.

This file does not copy the floors of the other projects:

- The floor and the tolerance of each `pack.*` measure are in `MEASURE_SPECS` of `@mark1russell7/packing`, from version 0.1.7. Their reasons are in the section "The floors of the guards" of `docs/MEASURES.md` of `packing`.
- The floor and the tolerance of each `joint.*` measure are in `JOINT_MEASURES` of `@mark1russell7/layout-contract`. Its table is in `docs/JOINT-MEASURES.md`.

## The order of promotions

- Promote one option at a time. After each promotion, the screen compares the next candidate with the new default.
- Two kept options of one step can change each other. Screen such a pair as a stack too, before the second promotion.

## Demotion

A later corpus can show that a default fails the win test against the option that it replaced. Then the old default comes back, with the same steps. The change of the default output is MINOR.

## The record of a promotion

The record of the idea in the catalog gets a field `promotion`. It holds the date, the prediction id and the screen run. It also holds the result of each test and the decision. The roadmap gets a row.
