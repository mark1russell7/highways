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

<!-- shared:paired-ratio -->
## The paired ratio

All tests use paired ratios. For each input and seed, the ratio of a measure is the value of the candidate divided by the value of the default. The two values come from the same input and the same seed.

- A ratio is "worse" in the direction of the measure. For a measure where less is better, a ratio of 1.02 is 2% worse. For a measure where more is better, the test uses the inverse ratio.
- When both values are 0, the ratio is 1.
- A median of a measure is the median of its ratios, not a ratio of two medians. Thus the verdict does not change with the scale of the inputs.
<!-- /shared:paired-ratio -->

<!-- shared:floor-rule -->
### The floor rule

Some measures have a floor: the best value that the measure can have. A measure with a floor of 0 gives no ratio when the default is at the floor. For example, a default with no merges has a largest merge angle of 0. Then each merge of the candidate is a loss without limit.

- When the default is at the floor of a measure on an input, that input uses an absolute tolerance in place of the ratio.
- The candidate is within the tolerance when its value minus the floor is at most the tolerance. Then the input is a tie, and its ratio is 1.
- Otherwise, the ratio of the input is +Infinity. It is not a veto. It goes into the median, the tail and the sign test as each other ratio does.
- The sign test drops each tie. The record counts the ties in the inputs where the floor rule applied.
- A win measure at the floor cannot win on that input. The default is at its best value, so the candidate can only tie or lose.
- Each measure has its own floor and tolerance, as two named parameters. The floors of each step give them or name their source. A measure without them has a tolerance of 0.
- A count has a tolerance of 0. Thus a count above 0 is beyond the tolerance.
- The record of the test names, for each measure, the inputs where the floor rule applied.
<!-- /shared:floor-rule -->

A floor that is not 0 keeps the ratio, because the ratio has a value there. For example, `B3` has a floor of 1. A ratio of 1.09 at that floor is a real stretch of 9%, so the ratio test applies.

<!-- shared:classification -->
### The per-input classification

The sign test, the wins and the flips put each input, or each board, in one of three classes: `"better"`, `"worse"` or `"tie"`. A change smaller than the resolution of a measure is noise, not a result. Thus the classification uses a minimum effect.

- `MeasureSpec` gets an optional field `minEffect?: number | { rel: number }`. It is separate from `tol`. `tol` is the slack above a floor, and it can be much larger than the resolution.
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
<!-- /shared:classification -->

[The minimum effects](#the-minimum-effects) gives the value of `minEffect` for each measure of `highways`.

<!-- shared:win-test -->
## The win test

The test compares the candidate with the current default on each input of the corpus. The guard measures are the guard measures of the step, which each repository lists. The win measures are the measures that the record of the idea names in `wins`.

| Test | Rule |
|---|---|
| Hard rules | On each input, each hard count of the candidate is at most that of the default. Two runs give the same output. |
| Median | For each guard measure, the median ratio is at most `1 + medianWorse`. |
| Tail | For each guard measure, at most a `tailShare` of the inputs have a ratio above `1 + tailWorse`. |
| Gain | One win measure has a median ratio of `1 - gainMin` or better. The sign test and the bootstrap of [The noise guard](#the-noise-guard) pass for it. |
| Time | The time ratio of an input is `t / b`, with `t` the median time of the candidate and `b` that of the default in one `paired-time/1` report. The test uses 5 CI jobs in mode `fresh`, each with the A/A arm. Each case runs in its own fresh processes. The worst median ratio of the 5 jobs is at most `timeRatio`. The tail set holds the inputs with `b` or `t` of `timeFloorMs` or more. On the tail set, the worst `timeTailQ` quantile of the 5 jobs is at most `timeTail`. The large bench fixtures stay in their CI time limit. |
| Stability | On the base and change pairs of the corpus, each stability measure is a guard measure. It passes the median and tail tests. |

The A/A arm of the same jobs gives the resolution of the time test, not a fixed constant.

- The median decision is valid only when `timeRatio` is above the worst A/A p90 of the 5 jobs plus their spread.
- The tail decision is valid only when `timeTail` is more than the worst A/A `timeTailQ` quantile of the tail set plus their spread.
- The spread of 5 values is the largest value minus the smallest value. The resolution has no margin factor and no fixed tolerance.
- Each decision uses the worst of the 5 jobs, so each job must pass. A candidate that passes in 4 jobs and not in the fifth fails.
- A job counts only when its A/A band from p10 to p90 contains 1. A job with a band that does not contain 1 measured the runner.
- A new job replaces a job that does not count. The record keeps the run of each job.
- The A/A quantile uses the ratios of the `~aa` arm in `inputs[].ratio`, with the linear quantile of `paired-time/1`.
- A decision that is not valid gives the verdict `cannot decide (noise)`. The record names the check and the A/A value. A candidate without a decision does not promote.
- An input under `timeFloorMs` in the two arms is too small to be a cost to the user.
- An empty tail set in the 5 jobs gives the line `tail: not measured, no input above timeFloorMs` in the record. It does not stop a promotion. The summary says "pass on the median" and "no read" of the tail, and the job writes a warning to the check line (NO-READ-LINE).
- An empty tail set in only some jobs makes the tail decision not valid.
- The record keeps the 5 medians and tails, the worst A/A values with their spreads, and the CI run. It keeps the CPU model of each job.

CI does the time test, because other jobs on a local machine change the times. CI times the candidate and the default in one job, with a fresh process for each arm, each input and each round. The order of the arms rotates by the round.
<!-- /shared:win-test -->

<!-- shared:noise-guard -->
### The noise guard

The screens test many ideas on one corpus, so some ideas pass by chance. The gain test has two guards against chance:

1. **The sign test.** Count the inputs where the win measure is better and the inputs where it is worse. Ties do not count. A one-sided sign test on these counts gives a p-value below `signP`.
2. **The paired bootstrap.** On the holdout inputs, take `bootstrapRuns` samples of the inputs, with replacement, from a fixed seed. Calculate the median ratio of each sample. The `bootstrapLevel` interval of these medians does not include 1. The statistic is the median, not the mean, so a ratio of +Infinity does not make the interval endless. The median of the log ratios gives the same interval.

The sign test replaces a fixed share of better inputs. A share of 60% of 20 inputs is not a signal, but 60% of 2000 inputs is a strong signal.
<!-- /shared:noise-guard -->

<!-- shared:confirmation-run -->
### The confirmation run

The program screens many ideas. At a p-value of 0.05, 1 idea in 20 with no effect passes by chance. The confirmation run controls this, and it also finds an option that fits only the corpus.

- The generators make a fresh set of inputs after the win test passes. No screen used these seeds before.
- The fresh set has `confirmInputs` or more inputs, in the same cells as the corpus.
- For a rule of the selector, the fresh set has `cellMin` or more inputs in each cell of the rule.
- The candidate passes the full win test on the fresh set, with the same parameters.
- The record of the promotion names the fresh seeds. A later screen does not use them for a decision.
<!-- /shared:confirmation-run -->

<!-- shared:verdict-family -->
### The verdict over families

A corpus has families of inputs. The seeds of one family are replicates of one board. Thus a family with many seeds does not decide a verdict alone.

- The family is the unit of a verdict. The field `familyBy` of the manifest gives the family of each input.
- The difference of an input compares the candidate with the default on the same input and seed, in the direction of the measure.
- The stratified mean is the mean of the family means. Each family has the same weight.
- The pooled mean is the mean of the inputs. Each input has the same weight, so a large family has a large weight.
- Each mean has a bootstrap interval. The bootstrap of the stratified mean draws the seeds inside each family.
- The permutation test is stratified and paired. A flip changes the sign of the difference of one input, inside its family. The statistic is the stratified mean.
- A verdict counts only when it holds under both weightings. The two means have the same sign, the two intervals are clear of 0, and the permutation p is below the level.
- When the two means have opposite signs, the verdict is "depends on the mix". Then the mix of the families in the corpus decides the sign.
- The sign test of the family signs is a report only. It does not decide a verdict.
- `verdict` of `layout-contract` calculates the verdict. The tie and the level have no default. Each caller gives them.

**The power.** With 6 families, the best two-sided p of a sign test is 0.031, at 6 of 6. At 5 of 6, the p is 0.22, so 5 of 6 is not significant. More seeds do not change this limit. Only more families change it.
<!-- /shared:verdict-family -->

<!-- shared:activation -->
### Activation

A candidate is "exercised" on an input when one of these conditions is true:

- Its own move count is more than 0. The record keeps the count as the trace measure `move.<name>`.
- It has a base, and its `outputHash` on the input is different from the `outputHash` of the base.

The base of an option is the same strategy without the option. The base of a highway finder is the same step with no highway. A packing strategy of the zoo has no base.

A verdict counts only when the candidate is exercised on one or more decision inputs. Otherwise the verdict is `not-exercised`, with a reason. The idea then goes back to be built again. It does not go to dropped.
<!-- /shared:activation -->

<!-- shared:distinctness -->
### Distinctness

Candidates with the same `outputHash` on each decision input make one "output group". The group id is the first candidate id in sort order. A group counts as one candidate in the counts of a wave and of a portfolio. The verdict of the group applies to each member.

A "cell group" has the same `outputHash` on each input of one cell. Only a selector rule uses a cell group: in that cell, its members are one option. The screen shows the cell groups as diagnostics.
<!-- /shared:distinctness -->

<!-- shared:output-hash -->
### The output hash

The `outputHash` of a record is the first 16 hexadecimal digits of the SHA-256 of the canonical JSON of the output. `outputHash` of layout-contract calculates it. Each stage sets the canonical form of its output:

- highways rounds each number to the grid of `RECORD_EPS`, and changes -0 to 0. Two code paths can give the same routes with different float noise.
- packing rounds each number of the placements to the grid of `RECORD_EPS` (3 decimals), and changes -0 to 0. It sorts the placements by id.
- The joint runner of layout-contract hashes the list of 2 hashes: the `outputHash` of the pack, then the `outputHash` of the routes. Each part uses the form of its stage.

Groups compare hashes only in one stage. A number near a rounding boundary can split a group, and then a real copy counts two times. Two outputs with the same rounded hash have each number in one grid step of the other.
<!-- /shared:output-hash -->

<!-- shared:deterministic-defaults -->
### Deterministic defaults

A default is deterministic. A portfolio limits its work by the member count and the input size, not by the wall time. A time budget is only an opt-in ceiling. A cut by the budget makes the output depend on the speed of the machine, so the record is not deterministic.
<!-- /shared:deterministic-defaults -->

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

For `pack`, `pack.deterministic` and the hard rules give the hard-rule test. The field `ms` of each record gives the time test. It is the median of `msRuns`.

<!-- shared:bound-by-count -->
### A bound by count

On mixed sizes, a lower bound by count is weak. It drops the largest items first, but a packer leaves out many small items. On the screen 3 of packing, the count bound was 1.5% of the overflow count. The area bound was 42% to 62% of the overflow area. Judge an overflow by the area excess (`pack.overflow.excessArea`), not by the count excess.

The `pack` step ranks its strategies in each cell in two levels. In a cell with a free size, the area excess is 0, thus `pack.fill` decides.

1. Rank by the area excess, with its `minEffect`.
2. Compare `pack.fill` only between the strategies with a tie on the area excess. Use only the inputs that each compared strategy packs with no overflow. A cell is "thin" when these shared inputs are less than 30% of the cell.
<!-- /shared:bound-by-count -->

<!-- shared:selector -->
## The selector

- The selector is a strategy that picks an option for each input. It reads only the cells of the input that are known before the step. The cells are `edgeDensity`, `edgeShape`, `groups` and `ports`, and the cells of the packer.
- A rule of the selector is a cell and an option. The win test must pass on the inputs of that cell, with `cellMin` or more inputs in the cell.
- A cell with fewer inputs gets more inputs from the generators before the decision.
- **The regret.** For each input, the oracle is the best option for that input. The regret of the selector is the median gap between its option and the oracle. A new rule must decrease the regret of the full selector on the full corpus. Thus many small wins in cells do not make a worse selector.
- **The flip rate.** Two inputs that are near the same, at the two sides of a cell edge, can get different options. Then the view jumps. The flip rate is the share of the change pairs where the option changes. A new rule keeps the flip rate at most `flipRate`.
- The selector is off by default.
<!-- /shared:selector -->

In `highways`, the first rule of the selector makes a later item (SELECT).

<!-- shared:joint-selector -->
## The joint selector

`layout-stack` owns the joint selector and its docs. Its docs carry the shared blocks of this note from the contract.

- The guards are the `joint.*` measures, the `pack.*` guards and the `route.*` guards.
- The `pack.*` guards are `pack.area`, `pack.fill`, `pack.aspectError` and `pack.order.inversions`.
- The hard rules are the rules of the two stages, with the `tolerance` field of each record.
- The cells are only the cells known before the placement. They are the dimensions of the packing taxonomy and the routing cells that do not use positions. These routing cells are `edgeDensity`, `edgeShape`, `groups` and `ports`.
- The parameters are the parameters of this note.
<!-- /shared:joint-selector -->

<!-- shared:parameters -->
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
<!-- /shared:parameters -->

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

## The sections time gate

The workflow `Sections gate` (`.github/workflows/sections-gate.yml`) fails a pull request when `sections-tree` gets slower at 10 000 nodes (GATE-LIMITS slices 1 to 3). It starts on each pull request that changes `packages/core/src`.

- One job times four arms in turn: the parent of the pull request, the head, the A/A copy of the parent and the fixed base. Each route has its own fresh process.
- Each arm routes the same board: the fixture `large-clustered` of `fa1dd82~1`. Each arm has 10 rounds.
- An A/A round ratio is the time of the A/A arm over the time of the parent in one round. Each round is one case of `@mark1russell7/rigor-bench`.
- The A/A spread is p90 of \|log r\| over the A/A round ratios. The ratio of a check is a median time over the median time of the other side.

| Rule | Value | What it does | Reason |
|---|---|---|---|
| The noise cap | log(1.06) = 0.058 on \|log r\| | A run with an A/A spread above the cap cannot decide. | The quiet run 41542329976 (#257) had the spread 0.027. The cap is approximately 2 times that spread. |
| The second run | 1 | After a run that cannot decide, the job `retry` starts the gate once more on a fresh runner. A second run that cannot decide fails the gate. | A noisy runner is often one bad runner. A run that cannot decide does not pass at any time. |
| The paths | `scripts/gates/scope.ts` | The job `changes` reads the imports of the measured route. A change outside them skips the gate. A walk that fails gives `**`, so the gate runs. | A change of a router that the gate does not measure gave a noise result on #303. Of the last 30 pull requests on the old paths, 10 skip. |
| The daily run | 1 for each day on main | The schedule times main in full. The check against the fixed base shows a rise that many pull requests made together. | A skip shows no missed effect for later pull requests. |
| Against the parent | `timeVerdict`, rule `difference`, margin max(log(1.05), the pooled A/A spread) | The outcome `slower` fails. The outcome `cannot decide` starts the second run. The outcomes `same` and `faster` pass. | The home decides with an interval, not with one ratio. The floor log(1.05) keeps the step of 5 % of slice 1 as the band `same`. |
| Against the fixed base | 1.10 | The check fails when the ratio head/fixed base is above 1.10. | A check against the parent misses a slow drift in many small steps. SECTIONS-SLOW found such a drift: each step stays below its minimum effect. The fixed base adds the steps. |

- The strategist gave the values of slice 1 on 2026-11-02, and the cap, the second run and the pool on 2026-11-03. Change a value only with a reason from the A/A data of the gate runs. The pull request of the change tells that reason.
- The summary of each run (`sections-gate.md`) shows the A/A spread of the run, the cap and the pool with its count of runs and cases. It also shows the margin, the interval and the outcome.
- The record `sections-gate.json` (schema `sections-gate/3`) keeps the same facts in its field `home`.
- The job resolves the inputs `head` and `parent` to full hashes one time, at the start (GATE-CONFIRM-SHA). Then each job times only these hashes. A name that does not resolve fails the job.
- The default head is the checkout, and the default parent is the first parent of the head. A dispatch with `-f head=<sha>` times that commit against its first parent.
- The summary and the record give the input text and the full hash of each commit, for example "the parent: `HEAD^1` = `414ec5f...`".

### The scale of the home

Slices 1 and 2 had their spreads on \|r - 1\|. The home `@mark1russell7/rigor-bench` has its spreads, its floor and its cap on \|log r\|. Slice 3 keeps the rules of slice 2 on the new scale:

| Rule | Slice 2, on \|r - 1\| | Slice 3, on \|log r\| |
|---|---:|---:|
| The noise cap | 0.06 | log(1.06) = 0.058 |
| The floor of the margin | 0.05 | log(1.05) = 0.049 |

A ratio of 1.06 has \|r - 1\| = 0.06 and \|log r\| = 0.058. So the cap of slice 3 lets the same runs decide as the cap of slice 2.

### Why slice 2 caps the noise

Slice 1 took the limit against the parent from the A/A spread of the same run. The two runs below show the hole.

| Run | Pull request | CPU | A/A spread on \|r - 1\| | Limit of slice 1 | Outcome of slices 2 and 3 |
|---|---|---|---:|---:|---|
| 41542329976 | #257 | AMD EPYC 7763 | 0.027 | 1.050 | The run passes. The home says `same`, with the interval 0.991 to 1.016. |
| 41548965076 | #255 | AMD EPYC 9V45 | 0.196 | 1.196 | The run cannot decide. Slice 1 passed it, but a step of 19 % passes such a limit. |

A noisy run makes its own limit wider, so the noisiest runner passes the largest step. Slice 2 cuts that link: the run gives only the yes or no of the cap, and the pool gives the band.

### The pool of A/A rounds

- The pool is in `packages/core/scripts/data/sections-gate/aa-pool.json`. Each run of the pool has its run id, its commit and the commit of its parent. It also has the CPU model, the date and its 10 A/A round ratios.
- The file keeps the spread of each run on \|r - 1\|, as slice 2 wrote it. The home uses the ratios, not that field.
- Only a run with an A/A spread at or below the cap goes into the pool. `aaSpread` of the home gives that spread. Only a run whose parent is a commit of `main` goes in.
- The A/A arm times the parent, so each run of a pull request to `main` gives A/A rounds of `main`.
- The pool keeps the newest 20 quiet runs. The gate gives each ratio to the home as one case. The option `run` names the run of each case with its run id and its job.
- The noise of the pooled band is the larger of the floor log(1.05) and p90 of \|log r\| over all the pooled cases. The home needs 5 pooled cases or more for a spread.
- `pnpm --filter @mark1russell7/highways gate:pool` rebuilds the pool from the artifacts of the gate runs. It makes one call of `gh run list`, and downloads the artifact `sections-gate-<sha>` of each run.
- Commit the new pool in a pull request. No workflow commits it to `main`.

The first pool (2026-11-03) has 3 quiet runs from the 7 runs of the workflow.

| Run | CPU | A/A spread on \|r - 1\| | In the pool |
|---|---|---:|---|
| 41551225572 | Intel Xeon 6975P-C | 0.033 | yes |
| 41549397160 | AMD EPYC 7763 | 0.101 | no, above the cap |
| 41548991752 | AMD EPYC 7763 | 0.051 | yes |
| 41548965076 | AMD EPYC 9V45 | 0.196 | no, above the cap |
| 41542329976 | AMD EPYC 7763 | 0.027 | yes |

Two more runs skipped the job `gate` or were cancelled, so they have no artifact. The 30 cases of the pool have the spread 0.042 on \|log r\|. That spread is below the floor 0.049, so the margin is the floor. The band `same` is 0.952 to 1.050.

Slice 2 used the floor until the pool had 5 runs. The home counts cases, not runs. The 30 cases of the 3 runs give a spread, but the floor is larger. The summary shows the count of runs, so a pool of few runs is clear.

### The shared home of the comparison

Since slice 3, `timeVerdict` of `@mark1russell7/rigor-bench` (0.2.0 or later) decides the check against the parent. `scripts/gates/home-verdict.ts` maps the rounds to the `PairedTime` records of the home. The gate gives these options:

| Option | Value |
|---|---|
| `rule` | `difference` |
| `margin` | log(1.05) = 0.049 |
| `noiseCap` | log(1.06) = 0.058 |
| `spreadLevel` | 0.9 |
| `pool` | the records of `aa-pool.json`, the floor log(1.05) = 0.049 and the run of each record |

The local code of the cap and of the pooled band is gone. The gate copies no verdict logic of the home.

- The rule `difference` gives an interval of the median ratio of the head over the median ratio of the A/A arm.
- The outcome is `same` when the interval is in the band of the margin. Else it is `slower` when the whole interval is above 1, and `faster` when it is below 1.
- Each other interval, and each run above the cap, gives `cannot decide`.

On the two runs above, the home gives the same outcome as slice 2. The quiet run is `same`, and the noisy run is `cannot decide`.

The home and the old rule 1 + max(0.05, the pooled spread) do not agree on each set of rounds. The tests of `scripts/sections-gate-verdict.test.ts` have these sets of made-up rounds:

| Rounds | The old rule | The home |
|---|---|---|
| The head is 3 % slower in each round, with a quiet A/A arm. | pass: 1.03 is below 1.05 | `same`: the interval is in the margin, so the gate passes |
| The head goes from 0.92 to 1.16, with the median 1.0625. | fail: 1.0625 is above 1.05 | `cannot decide`, with the interval 0.96 to 1.14: the retry |

The two agree on the step of 3 %. The margin log(1.05) is the claim of the gate: a change in 5 % is `same`. Since rigor-bench 0.2.0, `same` comes before `slower`, so the gate keeps its claim. On the wide head the home wins. The old rule compared one median with a fixed band, and it did not see how sure the ratio is. A head 19 % slower with a quiet A/A arm is `slower` under the two rules.

The other rules stay local:

- The check against the fixed base stays local code. It moves to `limitVerdict` of the home in GATE-FIXED-ROUNDS.
- `limitVerdict` needs 6 rounds or more for each case and 5 A/A cases or more. The gate has 10 rounds of one case.
- The confirm mode of `Sections bisect` keeps its local band rule. On the noisy run, that rule says `inside`, and the home says `cannot decide`.
- The fixed base is in `packages/core/scripts/data/sections-gate/fixed-base.json`, with its date and its reason. The first fixed base is the head of `main` when the gate merges.
- Move the fixed base only in a commit that tells the reason. An example is a feature that costs time on purpose.
- A check with no time does not pass, so the gate fails (FAIL-CLOSED).

<!-- shared:order-of-promotions -->
## The order of promotions

- Promote one option at a time. After each promotion, the screen compares the next candidate with the new default.
- Two kept options of one step can change each other. Screen such a pair as a stack too, before the second promotion.
<!-- /shared:order-of-promotions -->

<!-- shared:demotion -->
## Demotion

A later corpus can show that a default fails the win test against the option that it replaced. Then the old default comes back, with the same steps. The change of the default output is MINOR.
<!-- /shared:demotion -->

<!-- shared:profiles -->
## Caller profiles

A caller can need less than all the guards. For example, a free canvas does not keep the input order, but a list in reading order keeps it. The guards follow what each input and each caller declares.

- **Declared properties.** A guard of a property applies only to the inputs that declare the property. Each repository lists its properties, the input field or the caller option that declares each property, and the guard measures of each property. A property that no input of the corpus declares guards no input.
- **The core guards.** Each input has the hard rules, the time test, the stability test and the core measures. Each repository lists its core measures. A core measure cannot be dropped, because no caller accepts a large loss there.
- **The named profiles.** A profile is a named value of the caller options that change the output, for example the stretch cap of a router. Each repository lists its named profiles: the name, the option values, and the guard measures. The profile `all` is the profile without such options, so the current callers keep the current defaults.
- **Other option values.** When an option value is not a named profile, the repository maps it to one named profile. The map is part of the list of the repository, and it is deterministic. A map to a stricter profile keeps every guard of the caller.
- **A promotion.** The promotion rule applies one time for each named profile, and each profile has its own default. A repository with only `all` applies it one time. A candidate becomes the default of a profile when it passes the win test with the guards of that profile. The record names the profile. A promotion in one profile does not change the default of another profile.
- **The noise guard.** Each profile of a screen is one more test on the same corpus. The sign test of a screen with `n` profiles uses `signP / n`. Each profile that passes has its own confirmation run.
- **The version.** A new named profile is a new feature: a PATCH before 1.0.0, a MINOR after. This is true while the profile names are only an input. When callers match on the names, for example in an output field, a new name is a breaking change.
- **A changed default.** A change of the default of a named profile changes the output for its callers. Thus it is a breaking change: a MINOR before 1.0.0, a MAJOR after. The removal of a named profile is a breaking change too.
- **Demotion.** The demotion rule applies to each profile by itself.
<!-- /shared:profiles -->

The profiles of `highways`: the steps declare no property yet, and each guard measure of a step is a core measure. The only named profile is `all`. The map of the stretch cap comes with the first named cap profile.

## The record of a promotion

The record of the idea in the catalog gets a field `promotion`. It holds the date, the prediction id and the screen run. It also holds the result of each test and the decision. The roadmap gets a row.
