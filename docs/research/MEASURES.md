# The measures of a good result

This note is the research item MEAS0 of the [roadmap](../ROADMAP.md). It gives the measures of a good route, bundle, curve, group, zoom level and board.

Each measure has a formula, a scale, a cost class and a source. The later items use this note:

- MEAS1 puts the measures in the bench, with seeds, medians and spread. It gives the Pareto front of each step.
- MEAS2 compares each router to an exact optimum on small boards.
- CURV-R and GRP-R use the measures of the curves and of the groups.
- TUNE sweeps the options of each strategy against the measures.

## Summary

- The note gives 59 measures in six areas. Routes have 15, bundles 9, curves 11, groups 9, zoom levels 10 and room 5. Three more measures belong to the layout of the host.
- The bench measures 15 of the 59 today, and 9 in part. The other 35 are new.
- The new measures include the crossing angle, the plug spacing (the angular resolution of a box) and the bending energy of a curve. The stability across zoom levels is also new, and so is the ratio of the ink that bundles save.
- The note proposes 6 new hard rules. Four are for curves, one is for levels and one is for room.
- The [short list](#the-short-list-for-meas1) gives the order in which MEAS1 adds the measures.

## How to read an entry

Each area has one table. The columns are:

| Column | Meaning |
|---|---|
| Id | The id of the measure. MEAS1 uses it in the names of its columns. |
| Measure | The name of the measure. |
| Rewards | The property of a good result. |
| Formula | The math, in code font. The notation is in the next section. |
| Scale | The unit or the range. The sign `↓` means "lower is better". The sign `↑` means "higher is better". |
| Cost | The cost class. Refer to [Cost classes](#cost-classes). |
| Kind | `rule`, `fault` or `score`. Refer to [Kinds](#kinds). |
| Today | `yes`: the bench measures it. `part`: the bench measures a part of it or a near value. `no`: the bench does not measure it. |
| Source | The study or the design that the measure comes from. "Own" means a measure of this library, with the item that added it. |

### Notation

- `n` is the number of nodes, and `m` is the number of edges.
- `r_e` is the route of the edge `e`. It is a polyline with the points `p_0 .. p_k`.
- `L(r)` is the length of a polyline. `span(e) = dist(p_0, p_k)` is the distance between its ends.
- `φ_i` is the turn of a polyline at the vertex `i`, in radians from `-π` to `π`.
- `P` is the number of points of all routes.
- `S` is the set of drawn segments. A segment that several routes share counts one time, as in `measureQuality`.
- `X` is the set of crossings of `S`. `θ_x` is the angle of the crossing `x`, in degrees from 0 to 90.
- `κ(s)` is the curvature of a curve at the arc length `s`.
- `u` is the unit of length of a board: the median of the short sides of the boxes. A length divided by `u` has no unit, so boards of different sizes compare.
- `q_p(x)` is the `p` quantile of the values `x`. `q_0.5` is the median.

### Cost classes

MEAS1 measures fixtures with up to 100 000 nodes. The cost class tells the largest fixture for each measure.

| Class | Time | At 100 000 nodes |
|---|---|---|
| `linear` | `O(P + n + m)` | Yes, on each run. |
| `n log n` | A sort, or a query of the bucket grid of the bench (`Grid`). The grid is linear when the density of the boxes and the segments is even. | Yes, on each run. |
| `quadratic` | `O(n^2)` or `O(m^2)` for all pairs, or `O(p q)` for a pair of polylines with `p` and `q` points. | Only to 1 000 nodes. Above that, a seeded sample of 2 000 items gives an estimate, as `crossings` does today. |
| `extra run` | The measure routes a second input, or routes with a second router. | Twice the time. The workflow `Bench` starts it in CI. |

### Kinds

- A `rule` is a hard rule. A correct result has no violation. A strategy with a violation does not enter a Pareto front.
- A `fault` counts links with a known defect. A good result has 0. A fault is not a rule, because some boards have no result without the defect.
- A `score` is a value to make better. Scores make the axes of the Pareto fronts and the weights of TUNE.

## The state of today

### The hard rules of today

`checkProperties` in [`properties.ts`](../../packages/core/src/bench/properties.ts) checks 8 rules. `benchOne` in [`run.ts`](../../packages/core/src/bench/run.ts) checks a ninth rule: the same input gives the same result.

| Rule | What it checks |
|---|---|
| `complete` | Each edge has one route with two points or more. |
| `ends-at-plugs` | Each route starts and ends on the boxes of its nodes, within `TOLERANCE` (0.5 units). |
| `fixed-plugs` | The route of an edge with a fixed plug starts or ends at that plug. |
| `no-pass-through` | No segment of a route goes through a node that is not one of its ends. |
| `counts-sum` | At each level, the items hold each node one time. The counts of the links add up to the edges between the items. |
| `link-ends` | Each link of a level starts and ends on the boundaries of its items. |
| `bundle-trunk` | Each route of a bundle starts with its trunk. An edge is in one bundle at most. |
| `run-shared` | Each run has two edges or more. Each route of a run holds the points of the run in a row. |
| same twice | Two routes of the same input give the same data (`sameData`). |

### The values of today

The bench gives these values. The tables of these values use one seed of each fixture. Since MEAS1, the measure suite examines several seeds of each fixture family and gives the spread.

| Values | Function | File |
|---|---|---|
| `ink`, `crossings`, `bends`, `inflections`, `clearance`, `tight`, `detour`, `plugAngle` | `measureQuality` | [`quality.ts`](../../packages/core/src/bench/quality.ts) |
| `through`, `backtrack` (out and back), `worstDetour`, `outside` | `measureLinks` | [`links.ts`](../../packages/core/src/bench/links.ts) |
| `overlaps`, `items`, `groups` of each level | `measureLevel` | [`links.ts`](../../packages/core/src/bench/links.ts) |
| `through` (polyline, free and clamped), `length`, `ms` of each curve type | `benchCurveStrategies` | [`curves.ts`](../../packages/core/src/bench/curves.ts) |
| `area`, `laneThrough` and the faults of the far view | `benchRoom`, `sweepRoom` | [`room.ts`](../../packages/core/src/bench/room.ts) |
| `hubRoutes`, `runs`, `levels`, `farItems` | `sweepSections` | [`sections.ts`](../../packages/core/src/bench/sections.ts) |
| `mean`, `max` and `moved` of the Fréchet distance | `measureStability` | [`quality.ts`](../../packages/core/src/bench/quality.ts). No table of the bench uses it. |
| `ms`, `deterministic`, `violations` | `benchOne` | [`run.ts`](../../packages/core/src/bench/run.ts) |
| The short list below, the counts of the proposed hard rules, the spread over the seeds and the Pareto fronts (MEAS1) | `runSuite` | [`suite.ts`](../../packages/core/src/bench/suite.ts) and [`measures/`](../../packages/core/src/bench/measures/) |

### The gaps of today

- `bends` counts each vertex of a polyline. A sampled curve thus has many bends, and the value ignores the angle of each turn.
- `detour` is a mean, and `worstDetour` is a maximum. Neither value shows the spread, so one bad route hides in the mean.
- `crossings` counts each crossing of two shared stretches one time. The count with open lanes is different.
- No value gives the angle of a crossing, the space between plugs, the shape of a curve or the quality of a group.
- No value of the bench compares two zoom levels, or two results of inputs with a small change.

### The exact forms of MEAS3A

Since MEAS3A, the screen computes ten more measures. Some formulas below leave a choice open, so the screen uses the forms of this list. The code is in [`measures/lanes.ts`](../../packages/core/src/bench/measures/lanes.ts) and [`measures/levels.ts`](../../packages/core/src/bench/measures/levels.ts).

- R12: The legs are the drawn segments of `S`, each one time, with the set of edges that use it. Two legs count only when their sets of edges are different.
- R12: The limit `s_min` is the lane width, 4 units. The value adds the length of the near parts of each leg, without overlap, and divides it by `ink(S)`.
- R14: A leg counts when it is within 1° of an axis. A result without length gives 1.
- B5: The screen opens the lanes at the width 4. Along the route of `e`, it reads the side of each other edge `f` on each shared segment of both edges.
- B5: The side follows the direction of the route of `e`. A pair counts one time when the side changes between two consecutive shared segments of both edges.
- B7: The cells are a grid of side `u` from the origin, with `u` from `boardUnit`. The straight line of an edge joins the first and the last point of its route. An empty result gives 1.
- B8: The shared segments are the runs and the trunks of the bundles with two edges or more. In the screen, fewer runs is better, and a higher median and max are better.
- B9: The screen opens the lanes at the width 4. `frechet` is the discrete Fréchet distance. The screen gives the median and the max over the edges with a shared segment.
- M1: The screen does not open gaps. It divides the bounding box of the boxes and the open lanes at the width 4 by the bounding box of the boxes.
- M4: The screen counts the open lanes of the result at the width 4 that go through a box. The suite counts the lanes of `sections` after `openGaps`.
- Z2: The screen gives the count of the hard rule `link-ends` as a value.
- Z9: The screen reads only the levels with an item of two nodes or more. The edges of a link are the edges between its two items, in either direction.
- Z9: The screen samples each polyline at points `max(u / 4, L / 64)` apart and keeps the points outside both items. A link without such points on both sides does not count.

### The exact forms of SCREEN-MEASURES

SCREEN-MEASURES adds 11 measures to the screen: C4, C8, G4, G5, G7, H3, M2, M3, M5, Z1 and Z5. The code is in [`measures/`](../../packages/core/src/bench/measures/), and [`screen/measures.ts`](../../packages/core/src/bench/screen/measures.ts) gives the definition of each key.

- C4: Each inner sample gets the signed curvature `κ = φ / l` of C3. The sum is `L^3 · Σ (κ_(i+1) - κ_i)^2 / d_i` over the inner samples. The step `curve` gives `C4.median` and `C4.q95`.
- C8: The samples of the curve and the polyline of the route get points `u / 4` apart, or `L / 400` for a long route. The value is the discrete Fréchet distance over `u`. The step `curve` gives `C8.median` and `C8.max`.
- G4: The far view is the first level with 2 items or more. Only an item with 2 nodes or more counts, and a fill above 1 counts as 1.
- G5: The screen counts the overlaps on each level and adds the counts.
- G7: The far view gives the groups. A node alone in its group gets 0. Above 2000 nodes, two seeded samples of 2000 nodes give an estimate.
- Z1: The screen gives the count of the hard rule `counts-sum` as a value, as Z2 does.
- Z5: The levels sort by depth, and a level without items does not count. The screen gives `Z5.max` and `Z5.spread`, the population standard deviation of `log(lr_d)`.
- H3: The screen reads the routes, not the edges, because the router keeps the symmetry of the boxes or loses it. The maps are the two mirrors on the axes and the half turn about the center of the boxes.
- H3: A route maps when the map sends its ends to the centers of two nodes. An edge of those nodes must have a route with the same corners. The tolerance is `u / 4`.
- M2, M3 and M5: Only the step `whole` gives them. They compare the board of the output of the strategy with the input board. A whole strategy without a room strategy gives 0.
- M5: The pairs are each box and its 4 nearest boxes on the input board.
- M2: The records use M2 in two ways. `RULE-016` uses it for the order of the edges at a station. Five records use the order of the boxes, as this file does. The screen uses the order of the boxes.

## Routes

The evidence for routes is strong. [Purchase 1997][purchase97] found that the number of crossings has the largest effect on the understanding of a drawing. Bends and symmetry had a smaller effect. [Ware 2002][ware02] found that the path length has the largest effect on a path task, before the continuity of the path and the crossings. [Huang 2014][huang14] found that a crossing at a large angle costs less than a crossing at a small angle. [Wybrow 2009][wybrow09] routes for length and bends first, then moves the parallel legs apart.

| Id | Measure | Rewards | Formula | Scale | Cost | Kind | Today | Source |
|---|---|---|---|---|---|---|---|---|
| R1 | Crossings | Few crossings | `c = count(X)`, and `c / m` for each edge | count, `↓` | `n log n`, sampled above 20 000 segments | score | yes, `crossings`, and `R1.perEdge` of the suite | [Purchase 1997][purchase97], [Purchase 2002][purchase02] |
| R2 | Crossing angle | Crossings near a right angle | `ca = mean_x(θ_x) / 90` and `ca_min = min_x(θ_x)` | 0..1 and degrees, `↑` | `n log n`, the same pass as R1 | score | yes, `R2.angle` and `R2.min` of the suite | [Huang 2014][huang14], [Huang 2008][huang08], [Dunne 2009][dunne09] |
| R3 | Bends | Few real turns | `b(r) = count(i : abs(φ_i) > 1°)`, mean over routes | count for each route, `↓` | `linear` | score | part, `bends` counts each vertex | [Purchase 1997][purchase97], [Wybrow 2009][wybrow09] |
| R4 | Total turn | Paths that go straight on | `T(r) = Σ_i abs(φ_i) / π`, and `max_i abs(φ_i)` | half turns for each route, `↓` | `linear` | score | yes, `R4.turn` and `R4.max` of the suite | [Ware 2002][ware02] |
| R5 | Detour spread | Short routes, with no bad tail | `δ(e) = L(r_e) / span(e)`. Report `q_0.5(δ)`, `q_0.95(δ)` and the mean. | ratio `≥ 1`, `↓` | `linear` | score | yes, `R5.median`, `R5.q95` and `R5.mean` of the suite | [Ware 2002][ware02], [Wybrow 2009][wybrow09] |
| R6 | Worst detour | No very long route | `max_e δ(e)` | ratio `≥ 1`, `↓` | `linear` | score | yes, `worstDetour` | Own (QFIX), [Ware 2002][ware02] |
| R7 | Out and back | Routes that go toward their target | `count(e : backtrackOf(r_e) > max(40, 0.25 span(e))) / m` | share 0..1, `↓` | `linear` | fault | yes, `backtrack` | Own (QFIX, ER3b) |
| R8 | Clearance | Space between a route and the other boxes | `cl(r) = min(40, min_v dist(r, box(v)))` for each node `v` that is not an end. Report the mean of `cl / u`, and `tight = share(cl < 4)`. | units, `↑`, and share, `↓` | `n log n` | score | yes, `clearance` and `tight` | [Wybrow 2009][wybrow09], [Marriott 2014][marriott14] |
| R9 | Through | No route through a box | `count(e : r_e cuts the inside of a box that is not an end)` | count, `↓` | `n log n` | rule for routes, fault for level links | yes, `through` and `no-pass-through` | [Dunne 2009][dunne09] (edge tunnels) |
| R10 | Plug angle | Routes that leave along the normal of the side | `mean(angle(p_1 - p_0, normal))` at each end | degrees 0..180, `↓` | `linear` | score | yes, `plugAngle` | Own (H1) |
| R11 | Plug spacing | Plugs that are far apart on each side | For a side with `k` plugs, `ps = min gap / (side / (k + 1))`. Report `min` and `q_0.05` over the sides. | 0..1, `↑`. A value of 1 is even spacing. | `n log n`, a sort for each side | score | yes, `R11.min` and `R11.q05` of the suite | [Formann 1993][formann93], [Dunne 2009][dunne09] |
| R12 | Lane separation | Parallel legs of two edges with space between them | For the legs of two edges within 5° of parallel, with an overlap of their projections: `ns = Σ overlap(dist < s_min) / ink(S)` | share 0..1, `↓` | `n log n` | score | yes, `R12.share` of the screen | [Wybrow 2009][wybrow09] (nudge), [Pupyrev 2016][pupyrev16] |
| R13 | Outside | Routes in the bounding box of the board | `count(e : a point of r_e is more than 24 units outside the bounding box)` | count, `↓` | `linear` | fault | yes, `outside` | Own (QFIX, ER3c) |
| R14 | Orthogonality | Legs parallel to the axes, for an orthogonal style | `orth = Σ L(legs within 1° of an axis) / Σ_e L(r_e)` | 0..1, `↑` for the orthogonal style | `linear` | score | yes, `R14.share` of the screen | [Purchase 2002][purchase02], [Kieffer 2016][kieffer16] |
| R15 | Inflections | Turns in one direction | `count(i : sign(φ_i) ≠ sign(φ_(i-1)))` for each route | count, `↓` | `linear` | score | yes, `inflections` | Own (H1), [Levien 2009][levien09] |
| R16 | Lane balance | Even gaps between parallel routes, also when each gap is wide | For each leg, the nearest leg of other edges at each side within 5° of parallel and 8 lane widths, with the overlap `w` and the gap `g`: `cv = sd_w(g) / mean_w(g)`, and `low` is the share of `w` with `g < median_w(g) / 2` | `cv` no unit and share 0..1, `↓` | `n log n` | score | yes, `R16.cv` and `R16.low` of the screen | [Wybrow 2009][wybrow09] (nudge), [Pupyrev 2016][pupyrev16] |

### Notes on the routes

- R2 needs no extra pass. The pass of R1 finds each crossing, and the angle of the two segments is one more step.
- R11 is the angular resolution of a box. On a box, the routes of one side leave along the same normal, so the angle between them is 0. The space between their plugs takes the place of the angle.
- [Purchase 1997][purchase97] found no significant effect of the angular resolution or of the orthogonality. Thus R11 and R14 get low weights, but MEAS1 still reports them.
- R14 is a style, not a quality. A host app with an orthogonal style sets a high weight. A host app with curves sets a weight of 0.
- R12 counts the parallel ink that is too near. R16 counts uneven gaps, also when each gap is wide. On `screen-v3`, their Spearman correlation is 0.64, so they are not independent. `R16.low` against R12 is 0.22.

## Bundles

A bundle saves ink and shows the structure of the flow. It also hides the path of each edge. [Holten 2006][holten06] bundles along a hierarchy, and [Holten 2009][holten09] bundles by forces. [Gansner 2011][gansner11] bundles to minimize the ink, with a limit on the turn. [Nguyen 2017][nguyen17] and [Wallinger 2022][wallinger22] measure the false paths that a bundle shows. [Lhuillier 2017][lhuillier17] surveys the methods and their measures.

| Id | Measure | Rewards | Formula | Scale | Cost | Kind | Today | Source |
|---|---|---|---|---|---|---|---|---|
| B1 | Ink saved | Less ink for the same edges | `inkSaved = 1 - ink(S) / Σ_e L(r_e)` | 0..1, `↑` | `n log n`, a hash of the segments | score | yes, `B1.inkSaved` of the suite | [Gansner 2011][gansner11], [Lhuillier 2017][lhuillier17] |
| B2 | Bundled share | Edges that share their ways | `count(e : e is in a run or a bundle) / m` | 0..1, `↑` in context | `linear` | score | yes, `B2.share` of the screen | [Holten 2006][holten06] |
| B3 | Bundle stretch | Bundles that add little length | `st(e) = L(r_e) / L(r*_e)`, with `r*_e` the route of `corners`. Report `q_0.5` and `q_0.95`. | ratio, `↓` | `extra run` | score | yes, `B3.median` and `B3.q95` of the screen. MEAS2 adds `B3.max`, the largest stretch | [Pupyrev 2016][pupyrev16], [Wallinger 2022][wallinger22] |
| B4 | Ambiguity | No false neighbours | `N(v)` is the set of nodes whose routes share a segment with a route of `v`. `amb = Σ_v count(w in N(v) : no edge v-w) / Σ_v count(N(v))` | 0..1, `↓` | `quadratic`, sampled | score | yes, `B4.ambiguity` of the suite, sampled above 1000 nodes | [Wallinger 2022][wallinger22], [Nguyen 2017][nguyen17] |
| B5 | Lane crossings | Lanes that keep their order | `lc = count of pairs (e, f) whose lane order flips from one shared segment to the next` | count, `↓` | `n log n` | score | yes, `B5.crossings` of the screen. ROOM-C counts the lanes of the far view | [Pupyrev 2016][pupyrev16] |
| B6 | Merge angle | Smooth merges and splits | `ma = max angle of the turn of a lane where it joins or leaves a run` | degrees, `↓` | `linear` | score | yes, `B6.max` of the screen | [Gansner 2011][gansner11] (a limit of 40° on the turn) |
| B7 | Occupied area | Less clutter | `moa = cells that S touches / cells that the straight lines touch`, with cells of side `u` | ratio, `↓` | `n log n` | score | yes, `B7.ratio` of the screen | [Saga 2016][saga16] |
| B8 | Run profile | Bundles of a useful size | `runs`, `q_0.5` and `max` of the edges of each run | counts, in context | `linear` | score | yes, `B8.runs`, `B8.median` and `B8.max` of the screen | [Holten 2006][holten06], [Lhuillier 2017][lhuillier17] |
| B9 | Lane fidelity | Open lanes near their routes | `lf(e) = frechet(lane(e), r_e) / (laneWidth · k / 2)`, with `k` the edges of the widest shared segment of `e` | ratio, `≤ 1` is correct, `↓` | `quadratic` for each route, `linear` in `m` for short routes | score | yes, `B9.median` and `B9.max` of the screen | [Nguyen 2017][nguyen17], [Eiter 1994][eiter94] |
| B10 | Gap closed | Ink saved near the optimum | `gc = (B1(s) - B1(b)) / (B1* - B1(b))`. `b` is the baseline, and `B1*` is the optimum at the smallest cap at or above the largest stretch of `s`. | share of the gap, `↑`. 0 is the baseline, and 1 is the optimum | an exact solve for each input, kept in a file | score | yes, `gap` of the screen on `exact-v1`, with `gap.cap` and the views `gap.collection` and `gap.all` | [Magnanti and Wong 1984][magnanti84] |

### Notes on the bundles

- B1 and B3 pull in opposite directions. A Pareto front of B1 against B3 shows each router at its best trade.
- B4 here uses one step: two nodes are neighbours when their routes share a segment. [Wallinger 2022][wallinger22] also follows paths of two steps and more. MEAS1 starts with one step, because it is the cheapest.
- `laneRoutes` and `runKey` let a reader open each bundle. Thus a bundle of this library can hide a path only while it is closed. B4 measures the closed view.
- B10 needs a known optimum, so only the set `exact-v1` gives it. [`GAP.md`](GAP.md) ranks the strategies by B10.

## Curves

A curve must stay near its route, keep clear of the boxes and look smooth. G0 continuity joins the pieces. G1 continuity also joins their tangents, and G2 continuity also joins their curvatures.

[Horn 1983][horn83] gives the curve of least bending energy. [Moreton 1993][moreton93] argues that the variation of the curvature is a better measure of fairness. [Levien 2009][levien09] compares these measures and shows that the Euler spiral (clothoid) has good properties for each. [Hobby 1986][hobby86] gives smooth curves from the directions at the points. [Yuksel 2011][yuksel11] proves that only the centripetal Catmull-Rom spline has no cusp and no loop in a piece.

| Id | Measure | Rewards | Formula | Scale | Cost | Kind | Today | Source |
|---|---|---|---|---|---|---|---|---|
| C1 | G1 defect | Tangents that agree at each joint | `g1 = max_j angle(T_j^-, T_j^+)` at each joint `j` of two segments | degrees, `↓`. G1 when `g1 ≤ 0.5°`. | `linear` | rule candidate | yes, `C1.max` and `C1.share` of the suite, and the count `curve-g1` | [Levien 2009][levien09], [Hobby 1986][hobby86] |
| C2 | G2 defect | Curvature with no jump | `g2 = max_j abs(κ_j^- - κ_j^+) · u` | no unit, `↓` | `linear` | score | yes, `C2.median` and `C2.max` of the suite | [Levien 2009][levien09], [Moreton 1993][moreton93] |
| C3 | Bending energy | Curves that bend little | `E = L · ∫ κ(s)^2 ds` | no unit, `↓`. A full circle gives `4π^2`. | `linear` on the samples | score | yes, `C3.median` and `C3.q95` of the suite | [Horn 1983][horn83], [Levien 2009][levien09] |
| C4 | Curvature variation | Even change of the curvature | `V = L^3 · ∫ (dκ/ds)^2 ds` | no unit, `↓`. A circle gives 0. | `linear` on the samples | score | yes, `C4.median` and `C4.q95` of the screen | [Moreton 1993][moreton93] |
| C5 | Smallest radius | No tight kink | `rmin = 1 / max_s κ(s)`. Report `rmin / radius` and `rmin / u`. | ratio, `↑` | `linear` | score | no | [Gansner 2011][gansner11] (a limit on the curvature) |
| C6 | Length ratio | Curves that stay short | `Σ L(curve) / Σ L(polyline)` | ratio near 1, `↓` | `linear` | score | yes, `length`, and `C6.length` of the suite | Own (CURVE) |
| C7 | Curve clearance | Curves clear of the boxes | R8 on the output of `sampleCurve`, and `count(curves through a box that the polyline avoids)` | units, `↑`, and count, `↓` | `n log n` | rule candidate for the count | part, `clamped`, and the count `curve-clear` of the suite | Own (CURVE), [Wybrow 2009][wybrow09] |
| C8 | Deviation | Curves near their routes | `dev(e) = frechet(sampleCurve(c_e), r_e) / u`. Report `q_0.5` and `max`. | no unit, `↓` | `quadratic` for each route | score | yes, `C8.median` and `C8.max` of the screen | [Eiter 1994][eiter94], [Yuksel 2011][yuksel11] |
| C9 | Loops and cusps | Curves with no loop | `count(curves that cross themselves, or have a point of zero speed, where the polyline does not cross itself)` | count, `↓` | `n log n` for each curve | rule candidate | yes, the count `curve-simple` of the suite | [Yuksel 2011][yuksel11] |
| C10 | End tangent | Curves that leave and enter along the plug normal | `angle(T(0), normal)` and `angle(-T(L), normal)` | degrees, `↓` | `linear` | rule candidate for `spline` with normals | yes, the count `curve-ends` of the suite | Own (CURVE), [Hobby 1986][hobby86] |
| C11 | Curvature extrema | Few changes in the bend | `count(local extrema of κ) + count(sign changes of κ)` for each curve | count, `↓` | `linear` | score | no | [Levien 2009][levien09], [Moreton 1993][moreton93] |

### Notes on the curves

- MEAS1 measures C2 to C5 on the samples of `sampleCurve`, from the turn of each pair of sample legs. A tolerance of 0.25 units gives a stable estimate.
- C3 and C4 multiply by powers of the length `L`. Thus the value of a curve does not change when the board changes its scale.
- The type `rounded` uses quadratic pieces, and the type `arc` uses circular arcs. Both are G1 but not G2, because the curvature jumps at the ends of each arc. A clothoid corner of CURV2 is G2. C2 shows the difference.

## Groups

A group of the far view stands for its nodes. A good group holds many edges inside it, has few edges to other groups and has a compact shape on the board. The modularity of [Newman 2004][newman04] and the conductance of [Kannan 2004][kannan04] measure the edges. The silhouette of [Rousseeuw 1987][rousseeuw87] measures the positions. The cost of [Dasgupta 2016][dasgupta16] measures a whole tree of groups. [von Luxburg 2010][luxburg10] measures the stability of a grouping. The adjusted Rand index of [Hubert 1985][hubert85] compares two groupings.

| Id | Measure | Rewards | Formula | Scale | Cost | Kind | Today | Source |
|---|---|---|---|---|---|---|---|---|
| G1 | Modularity | Many edges inside the groups | `Q = Σ_c (e_c / m - (d_c / (2m))^2)`, with `e_c` the edges inside `c` and `d_c` the sum of the degrees in `c` | -0.5..1, `↑` | `linear` | score | yes, `G1.modularity` of the suite, on the far level | [Newman 2004][newman04] |
| G2 | Cut share | Few edges between the groups | `cut_d = Σ counts of the links of level d / m` | 0..1, `↓` | `linear` | score | yes, `G2.cut` of the suite, on the far level | [Kannan 2004][kannan04] |
| G3 | Conductance | No group that leaks | `φ(c) = cut(c) / min(vol(c), vol(V) - vol(c))`, with `vol` the sum of the degrees. Report `max` and `q_0.5`. | 0..1, `↓` | `linear` | score | no | [Kannan 2004][kannan04] |
| G4 | Fill | Compact groups | `fill(c) = Σ_(v in c) area(box(v)) / area(box(c))` | 0..1, `↑` | `linear` | score | yes, `G4.fill` of the screen | Own (ER3), [Elmqvist 2010][elmqvist10] |
| G5 | Overlaps | Groups that do not cover each other | `count(pairs of items whose boxes overlap by more than TOLERANCE)` | count, `↓` | `n log n` | fault | yes, `overlaps`, and `G5.overlaps` of the screen | [Misue 1995][misue95] |
| G6 | Balance | Groups of similar size | `bal = H(s) / log(k)`, with `s` the shares of the nodes of the `k` groups and `H` the entropy | 0..1, `↑` | `linear` | score | no | [Dasgupta 2016][dasgupta16] |
| G7 | Silhouette | Groups that are near on the board | `s(v) = (b_v - a_v) / max(a_v, b_v)`, with `a_v` the mean distance to the centers of its group and `b_v` the smallest mean distance to another group | -1..1, `↑` | `quadratic`, sampled | score | yes, `G7.silhouette` of the screen | [Rousseeuw 1987][rousseeuw87] |
| G8 | Tree cost | Edges that close low in the tree | `D = Σ_((u,v) in E) leaves(lca(u, v)) / (m n)` | 0..1, `↓` | `linear` times the depth | score | yes, `G8.treeCost` of the suite | [Dasgupta 2016][dasgupta16] |
| G9 | Group stability | The same groups after a small change | `ARI(groups(G), groups(G'))`, with `G'` the graph after one node moves by `u`, or after one edge is added or removed | -1..1, `↑`. A value of 1 is the same grouping. | `extra run`, then `linear` | score | yes, `G9.ari` of the suite, after `changeGraph` | [Hubert 1985][hubert85], [von Luxburg 2010][luxburg10] |

### Notes on the groups

- G8 fits the router `sections` well. An edge goes up to the lowest common section of its ends, so `leaves(lca(u, v))` is the size of the section that its route crosses. A low `D` means short ways through the hubs.
- G1 and G3 read the edges only. G4 and G7 read the positions only. The rule `quadtree` scores well on G4 and G7. The rule `keys` scores well on G1 when the keys follow the edges. GRP-R compares mixed rules on both sides.

## Zoom levels

A zoom level shows a group as one item, and the edges between two items as one link with a count. A reader keeps a mental map from level to level. [Misue 1995][misue95] names the parts of the mental map: the orthogonal order, the proximity and the topology. [Bridgeman 2000][bridgeman00] gives distance and order measures between two drawings. [Archambault 2011][archambault11] found that the mental map had little effect on the errors and the times in their tasks. Thus the order of the items matters more than an exact position.

[Nachmanson 2015][nachmanson15] keeps the number of shown items under a limit at each zoom. [Mondal 2018][mondal18] keeps the change of that number small from level to level. [Elmqvist 2010][elmqvist10] gives the rules of a hierarchy of aggregates. [Perlin 1993][perlin93] shows more detail at a closer zoom.

| Id | Measure | Rewards | Formula | Scale | Cost | Kind | Today | Source |
|---|---|---|---|---|---|---|---|---|
| Z1 | Counts sum | Links that stand for each edge | The items hold each node one time, and `Σ counts = edges between items` | violations, `↓` | `linear` | rule | yes, `counts-sum`, and `Z1.countsSum` of the screen | Own (H3) |
| Z2 | Link ends | Links that touch their items | Each link starts and ends on the boundary of its items | violations, `↓` | `linear` | rule | yes, `link-ends`, and `Z2.linkEnds` of the screen | Own (ER2) |
| Z3 | Level link faults | Level links with no fault | R6, R7, R9 and R13 on the links of each level | counts and ratio, `↓` | `n log n` | fault | yes, the level columns | Own (ER3a, ER3b, ER3c) |
| Z4 | Item budget | Few shown elements at each level | `eb = max_d (items_d + links_d) / B`, with `B` the budget of the host | ratio, `≤ 1` is correct, `↓` | `linear` | score | part, `farItems` and `levels` | [Nachmanson 2015][nachmanson15] |
| Z5 | Level ratio | Even steps from level to level | `lr_d = items_(d+1) / items_d`. Report `max` and the spread of `log(lr_d)`. | ratio, `↓` for the spread | `linear` | score | yes, `Z5.max` and `Z5.spread` of the screen | [Mondal 2018][mondal18] |
| Z6 | Nesting | Levels that refine each other | `count(items of level d+1 whose nodes are in more than one item of level d)` | count, `↓` | `linear` | rule candidate | yes, the count `level-nesting` of the suite | [Elmqvist 2010][elmqvist10] |
| Z7 | Position stability | Items that stay near their parts | `ps = mean_(v,d) dist(center(item_d(v)), center(item_(d+1)(v))) / size(item_d(v))` | no unit, `↓` | `linear` | score | yes, `Z7.position` of the suite | [Bridgeman 2000][bridgeman00] |
| Z8 | Order stability | The same order on each axis at each level | `τ_x` and `τ_y`: the Kendall tau between the order of the item centers and the order of the centroids of their nodes | -1..1, `↑` | `n log n` | score | yes, `Z8.order` of the suite, sampled above 1500 items | [Misue 1995][misue95], [Kendall 1938][kendall38] |
| Z9 | Link agreement | Level links that follow the routes of their edges | `la = mean over links of hausdorff(link, routes of its edges outside the two items) / u` | no unit, `↓` | `quadratic` for each link, sampled | score | yes, `Z9.mean` of the screen | [Elmqvist 2010][elmqvist10], [Perlin 1993][perlin93] |
| Z10 | Route stability | Routes that move little after a small change of the input | `measureStability(before, after)`: the mean and the max of the Fréchet distance, and the share of the routes that move | units and share, `↓` | `extra run`, then `quadratic` for each route | score | yes, `Z10.mean`, `Z10.max` and `Z10.moved` of the suite, up to 1000 nodes | [Bridgeman 2000][bridgeman00], [Archambault 2011][archambault11] |
| Z11 | Move response | Routes that answer a move of one node only near that node | One node moves by one unit `u` and the edges stay: `gain = Σ_e frechet / u / max(1, degree)`, and `spill` is the share of the other routes that move more than 1 unit | `gain` no unit, 1 is local, and share 0..1, `↓` | `extra run`, then `quadratic` for each route | score | yes, `Z11.gain` and `Z11.spill` of the screen, up to 1000 nodes | [Bridgeman 2000][bridgeman00] |
| Z12 | Seed stability | Routes that do not change with the seed of a strategy | A strategy with the option `seed` routes again with `seed + 1`: the mean Fréchet distance and the share of the routes that move. A strategy without a seed has 0 | units and share, `↓` | `extra run`, then `quadratic` for each route | score | yes, `Z12.mean` and `Z12.moved` of the screen, up to 1000 nodes | [Bridgeman 2000][bridgeman00] |

### Notes on the zoom levels

- Z7 and Z8 compare two levels of one result. Z10 compares two results of two inputs. Both kinds are stability, and the bench has neither today.
- Z8 uses the order and not the distance, because a reader keeps the order better ([Misue 1995][misue95]).
- Z11 separates two parts of Z10. The move of one node has an expected local response: the edges of that node move by approximately one unit. `Z11.gain` above 1 tells that the response is larger than the move. `Z11.spill` tells that it reaches other routes.
- On `screen-v3`, the median `Z11.gain` of `straight` is 0.96, and of `shared` 4.2. On the clustered families, the field bundlers spill most: `cubu` 0.44, `territories` 0.36 and `mlseb` 0.27.
- Z12 reads only the option `seed` of the strategy. A strategy that keeps a seed inside, as the fit of `preferences`, has 0. A wrapper with its own fixed options hides the seed too.
- The input change of Z10 and G9 is seeded: one node moves by `u`, one edge is added, or one edge is removed. The change is the same for each strategy.
- For the step `highway`, the screen option `edits` gives Z10 over a sequence of seeded changes, with the plan before each change. It also gives the churn of the highways and the share of the highways that keep their id (BUILD-W2A).

## Room

`openGaps` moves boxes apart, so the room step changes the layout of the host. A good change is small and keeps the order of the boxes.

| Id | Measure | Rewards | Formula | Scale | Cost | Kind | Today | Source |
|---|---|---|---|---|---|---|---|---|
| M1 | Area | Little growth of the board | `area(open) / area(packed)` | ratio `≥ 1`, `↓` | `linear` | score | yes, `area`, `M1.area` of the suite, and `M1.area` of the screen for the lanes of a route | Own (ROOM) |
| M2 | Order kept | The same rows, columns and order | `count(pairs of boxes whose order or alignment on an axis changes)` | count, `↓` | `n log n` | rule candidate | yes, the count `room-order` of the suite, and `M2.order` of the step `whole` of the screen | [Misue 1995][misue95] |
| M3 | Displacement | Boxes that move little | `mean_v dist(box_open(v), box_packed(v)) / u` | no unit, `↓` | `linear` | score | yes, `M3.displacement` of the step `whole` of the screen | [Bridgeman 2000][bridgeman00] |
| M4 | Lane routes through boxes | Room for each lane | `count(lane routes of laneRoutes that go through a box)` | count, `↓` | `n log n` | fault | yes, `laneThrough`, `M4.laneThrough` of the suite, and `M4.laneThrough` of the screen for the lanes of a route | Own (ROOM) |
| M5 | Distance distortion | Distances that keep their ratios | Kruskal stress of the centers: `σ = sqrt(Σ (α d'_ij - d_ij)^2 / Σ d_ij^2)`, with `α` the best scale and the pairs of neighbour boxes only | 0..1, `↓` | `n log n` | score | yes, `M5.stress` of the step `whole` of the screen | [Ahmed 2024][ahmed24], [Gansner 2004][gansner04] |

## The layout of the host

The host places the boxes, so these measures are not scores of this library. They help to read a fixture, and M5 uses the stress.

| Id | Measure | Rewards | Formula | Scale | Cost | Kind | Today | Source |
|---|---|---|---|---|---|---|---|---|
| H1 | Stress | Distances on the board that match the distances in the graph | `stress = Σ_(i<j) w_ij (dist(i, j) - d_ij)^2`, with `w_ij = d_ij^-2` | `↓`. Use the scale-free form of Kruskal. | `quadratic`, sampled | not a score | no | [Gansner 2004][gansner04], [Ahmed 2024][ahmed24] |
| H2 | Edge length spread | Edges of similar length | `cv = sd(span(e)) / mean(span(e))` | no unit, `↓` | `linear` | not a score | no | [Purchase 2002][purchase02], [Kobourov 2012][kobourov12] |
| H3 | Symmetry | Mirror and turn symmetry of the drawing | The share of the edges that map to an edge under the best axis of symmetry | 0..1, `↑` | `quadratic` | not a score | yes, `H3.share` of the screen, for the routes | [Purchase 1997][purchase97], [Bennett 2007][bennett07] |

## Method

### Compare like with like

- Compare two strategies of one step only. Keep the fixture, the seed and the strategies of the other steps the same.
- Start each table with a fair baseline that breaks no hard rule. The baselines are `straight` and `corners` for routers, and `straight` for curves. For room, the baseline is the board with the gutter only. For a sweep of options, it is the defaults.
- Remove each result with a rule violation from the Pareto front. Report it in its own row.
- Compare the level measures only between routers with levels.
- Measure the time only in CI. The load of a shared machine makes a local time unreliable.

### Order and normalization

- Order the kinds lexicographically: first the rules, then the faults, then the scores ([Marler 2004][marler04]). A fault of 1 is worse than any change of a score.
- Give each score without a unit. Divide a length by `u` or by the span. Divide a count by `m` or by the number of pairs.
- For a weighted sum, map each score to 0..1. Use the range from the baseline to the best value on the family of fixtures. This range is the ideal point and the nadir point of [Marler 2004][marler04].

### Pareto fronts

- A result `a` dominates a result `b` when `a` is no worse on each score and better on one score. The front is the set of results that no result dominates.
- MEAS1 gives the front of each step on two to four scores. Examples: ink saved (B1) against bundle stretch (B3), area (M1) against lane routes through boxes (M4), crossings (R1) against detour (R5).
- A weighted sum finds no point in a concave part of a front ([Das 1997][das97]). Thus TUNE first gives the whole front. Then it picks a point with the weights of the host, with the min-max (Chebyshev) form of [Marler 2004][marler04].
- The hypervolume of a front, with the baseline as the reference point, gives one number for a set of options ([Zitzler 1999][zitzler99]). A larger hypervolume is a better set.

### Statistics

- Make each fixture a family of seeded boards. MEAS1 starts with 20 seeds for each family, and CI can raise the number.
- Report the median and the interquartile range (`q_0.25` to `q_0.75`) of each measure over the seeds.
- Give a 95% confidence interval of each median with 2 000 bootstrap resamples ([Efron 1979][efron79]).
- Compare two strategies on the same seeds. Give the effect size `Â12 = P(X < Y) + 0.5 P(X = Y)` of [Vargha 2000][vargha00]. The limits 0.56, 0.64 and 0.71 mean a small, a medium and a large effect. [Arcuri 2011][arcuri11] recommends this test and this effect size for randomized algorithms.
- Accept a change as "better" only when the interval of the difference excludes 0 and `Â12` is 0.64 or more.
- Give the Kendall tau of the rankings of the strategies on two families ([Kendall 1938][kendall38]). A high tau shows a ranking that does not depend on the family.

### The gap to an optimum

MEAS2 adds small boards with a known optimum: the set `exact-v1`. The exact model is fixed-charge network design (HWY-040), solved with HiGHS. [`GAP.md`](GAP.md) gives the result for each strategy.

- The measure is the gap closed (B10): `(B1 of the strategy - B1 of the baseline) / (the optimum B1 - B1 of the baseline)`.
- The optimum is the optimum at the smallest stretch cap of 1.1, 1.25 and 1.5 at or above the largest stretch of the routes. Above 1.5, a run has no value.
- The stretch of the cap is the stretch of the exact model (`gap.stretch`). It divides the length of a route without its plug ends by the shortest way in the network of the model.
- The rule `collection` lets only the edges of one collection share a link. Its baseline is `shared`.
- The rule `all` lets each edge share a link. Its baseline is `shared-ways-all`, routed with `follow`.
- The screen takes the rule `all` for a run with a shared segment that holds edges of two collections, else `collection`.
- When the denominator is 0 or less, a run has no value.
- The summary gives the median of each class and the 95% paired bootstrap interval of the median over all inputs, with 10000 samples.
- The file `optima-exact-v1.json` keeps each optimum with the hash of its input. A screen reads the file and does not solve again. A test compares each hash with its input.

#### The size ladder

The size ladder finds the largest board that HiGHS solves to a proven optimum within 300 s. CI solved the ladder in the [run 40613531631](https://github.com/mark1russell7/highways/actions/runs/40613531631), at the cap 1.5, with 3 seeds of each class and both rules.

| Nodes | Proven, both rules | Proven, rule `collection` | Proven, rule `all` | Largest finite MIP gap at 300 s |
|---:|---:|---:|---:|---:|
| 10 | 24 of 24 | 12 of 12 | 12 of 12 | 0 |
| 14 | 20 of 24 | 12 of 12 | 8 of 12 | 0.072 |
| 18 | 10 of 24 | 9 of 12 | 1 of 12 | 0.169 |
| 24 | 4 of 24 | 4 of 12 | 0 of 12 | 0.212 |
| 30 | 0 of 24 | 0 of 12 | 0 of 12 | 0.262 |
| 40 | 0 of 24 | 0 of 12 | 0 of 12 | 0.952 |

- The largest size proven on each class and each rule is 10 nodes. For the rule `collection` alone, it is 14 nodes.
- Thus `exact-v1` has boards of 10 nodes and 15 edges. All 240 optima of `exact-v1` are proven ([run 40616274264](https://github.com/mark1russell7/highways/actions/runs/40616274264)). The longest solve took 223 s.
- At 30 nodes and more, HiGHS proves no optimum within 300 s. On some boards of 30 and 40 nodes, HiGHS gives no finite MIP gap.

## Proposed hard rules

Each candidate starts as a count in MEAS1. When each built-in strategy gives 0 on each fixture in CI, the count becomes a rule in `checkProperties`.

| Rule | What it checks | Measure | Why it can be a rule |
|---|---|---|---|
| `curve-clear` | With the free space, a curve goes through no box that its polyline avoids. | C7 | The README promises it. The bench counts it as `clamped`, but no rule checks it. |
| `curve-ends` | Each curve starts and ends at the ends of its polyline. A `spline` with normals leaves and enters along them, within 1°. | C10 | The rule `ends-at-plugs` checks the polylines, not the curves. A renderer draws the curves. |
| `curve-g1` | The types `rounded`, `arc` and `spline` are G1 at each joint, except at a corner that the free space keeps sharp. | C1 | Each of these types is G1 by its design. A defect shows a bug. |
| `curve-simple` | A curve does not cross itself and has no cusp where its polyline does not cross itself. | C9 | The centripetal spline has this property ([Yuksel 2011][yuksel11]). Rounded corners and arcs keep it when their radius fits the legs. |
| `level-nesting` | The nodes of each item of a level are in one item of the level before it. | Z6 | The tree of sections nests by its design. A consumer rule of the step `group` can break it, so a rule catches that. |
| `room-order` | `openGaps` keeps the order and the alignment of each pair of boxes on each axis. | M2 | The README promises it. The unit tests check it on fixed boards only. |

## The short list for MEAS1

MEAS1 first adds the seeds and the spread of the method section. Then it adds the measures in this order. MEAS1 added each of them to the bench. The order puts strong evidence and a low cost first.

| Order | Measures | Why first |
|---|---|---|
| 1 | R2 crossing angle | Strong evidence after the count of crossings. It uses the pass of R1, so it costs almost nothing. |
| 2 | B1 ink saved | One division of values of today. It makes the bundles of different boards compare. |
| 3 | R5 detour spread and R4 total turn | The path length and the continuity have the largest effect on path tasks. Both are `linear`. |
| 4 | C1, C2 and C3: G1 defect, G2 defect and bending energy | CURV-R and CURV2 need them. They are `linear` on the samples of today. |
| 5 | Z8 order stability and Z7 position stability | The bench has no stability measure across zoom levels. ROOM2 needs them. |
| 6 | Z10 route stability | The function exists. MEAS1 adds the seeded input change and a table. |
| 7 | R11 plug spacing | The angular resolution of a box. It is a sort for each side. |
| 8 | G1 modularity, G2 cut share and G8 tree cost | GRP-R and GRP2 need them. All are `linear`. |
| 9 | B4 ambiguity | The main risk of a bundle. It is `quadratic`, so it uses a sample. |
| 10 | G9 group stability | It needs an extra run for each change. |

## Sources

- <a id="ahmed24"></a>Ahmed and others, 2024. [`Size should not matter: scale-invariant stress metrics`](https://arxiv.org/abs/2408.04688).
- <a id="arcuri11"></a>Arcuri and Briand, 2011. [A practical guide for using statistical tests to assess randomized algorithms in software engineering](https://www.simula.no/publications/practical-guide-using-statistical-tests-assess-randomized-algorithms-software-0). ICSE 2011.
- <a id="archambault11"></a>Archambault, Purchase and Pinaud, 2011. [Animation, small multiples, and the effect of mental map preservation in dynamic graphs](https://doi.org/10.1109/TVCG.2010.78). IEEE TVCG 17(4).
- <a id="bennett07"></a>Bennett, Ryall, Spalteholz and Gooch, 2007. [The aesthetics of graph visualization](https://diglib.eg.org/handle/10.2312/COMPAESTH.COMPAESTH07.057-064). Computational Aesthetics 2007.
- <a id="bridgeman00"></a>Bridgeman and Tamassia, 2000. [Difference metrics for interactive orthogonal graph drawing algorithms](https://doi.org/10.7155/jgaa.00025). JGAA 4(3).
- <a id="das97"></a>Das and Dennis, 1997. [A closer look at drawbacks of minimizing weighted sums of objectives for Pareto set generation](https://doi.org/10.1007/BF01197559). Structural Optimization 14.
- <a id="dasgupta16"></a>Dasgupta, 2016. [A cost function for similarity-based hierarchical clustering](https://arxiv.org/abs/1510.05043). STOC 2016.
- <a id="dunne09"></a>Dunne and Shneiderman, 2009. [Improving graph drawing readability by incorporating readability metrics](https://www.cs.umd.edu/users/ben/papers/Dunne2009Improving.pdf). HCIL-2009-13.
- <a id="efron79"></a>Efron, 1979. [Bootstrap methods: another look at the jackknife](https://doi.org/10.1214/aos/1176344552). Annals of Statistics 7(1).
- <a id="eiter94"></a>Eiter and Mannila, 1994. [Computing discrete Fréchet distance](https://www.kr.tuwien.ac.at/staff/eiter/et-archive/files/cdtr9464.pdf). CD-TR 94/64.
- <a id="elmqvist10"></a>Elmqvist and Fekete, 2010. [Hierarchical aggregation for information visualization](https://hal.science/hal-00696751). IEEE TVCG 16(3).
- <a id="formann93"></a>Formann and others, 1993. [Drawing graphs in the plane with high resolution](https://doi.org/10.1137/0222063). SIAM J. Comput. 22(5).
- <a id="gansner04"></a>Gansner, Koren and North, 2004. [Graph drawing by stress majorization](https://www.graphviz.org/documentation/GKN04.pdf). GD 2004.
- <a id="gansner11"></a>Gansner, Hu, North and Scheidegger, 2011. [Multilevel agglomerative edge bundling for visualizing large graphs](https://www.sci.utah.edu/images/people/Alumni/scheidegger/gansner_edge_bundling.pdf). PacificVis 2011.
- <a id="hobby86"></a>Hobby, 1986. [Smooth, easy to compute interpolating splines](https://doi.org/10.1007/BF02187690). Discrete and Computational Geometry 1.
- <a id="holten06"></a>Holten, 2006. [Hierarchical edge bundles](https://doi.org/10.1109/TVCG.2006.147). IEEE TVCG 12(5).
- <a id="holten09"></a>Holten and van Wijk, 2009. [Force-directed edge bundling for graph visualization](https://doi.org/10.1111/j.1467-8659.2009.01450.x). Computer Graphics Forum 28(3).
- <a id="horn83"></a>Horn, 1983. [The curve of least energy](https://dspace.mit.edu/handle/1721.1/5697). ACM TOMS 9.
- <a id="huang08"></a>Huang, 2008. [An eye tracking study into the effects of graph layout](https://arxiv.org/abs/0810.4431).
- <a id="huang14"></a>Huang, Eades and Hong, 2014. [Larger crossing angles make graphs easier to read](https://doi.org/10.1016/j.jvlc.2014.03.001). JVLC 25(4).
- <a id="hubert85"></a>Hubert and Arabie, 1985. [Comparing partitions](https://doi.org/10.1007/BF01908075). Journal of Classification 2.
- <a id="kannan04"></a>Kannan, Vempala and Vetta, 2004. [On clusterings: good, bad and spectral](https://doi.org/10.1145/990308.990313). JACM 51(3).
- <a id="kendall38"></a>Kendall, 1938. [A new measure of rank correlation](https://doi.org/10.1093/biomet/30.1-2.81). Biometrika 30.
- <a id="kieffer16"></a>Kieffer, Dwyer, Marriott and Wybrow, 2016. [HOLA: human-like orthogonal network layout](https://ialab.it.monash.edu/~dwyer/papers/hola2015.pdf). IEEE TVCG 22(1).
- <a id="kobourov12"></a>Kobourov, 2012. [Spring embedders and force directed graph drawing algorithms](https://arxiv.org/abs/1201.3011).
- <a id="levien09"></a>Levien, 2009. [From spiral to spline: optimal techniques in interactive curve design](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2009/EECS-2009-162.html). UCB/EECS-2009-162.
- <a id="lhuillier17"></a>Lhuillier, Hurter and Telea, 2017. [State of the art in edge and trail bundling techniques](https://doi.org/10.1111/cgf.13213). Computer Graphics Forum 36(3).
- <a id="luxburg10"></a>von Luxburg, 2010. [Clustering stability: an overview](https://arxiv.org/abs/1007.1075). `Foundations and Trends in Machine Learning` 2(3).
- <a id="magnanti84"></a>Magnanti and Wong, 1984. [Network design and transportation planning: models and algorithms](https://doi.org/10.1287/trsc.18.1.1). Transportation Science 18(1).
- <a id="marler04"></a>Marler and Arora, 2004. [Survey of multi-objective optimization methods for engineering](https://doi.org/10.1007/s00158-003-0368-6). Structural and Multidisciplinary Optimization 26.
- <a id="marriott14"></a>Marriott, Stuckey and Wybrow, 2014. [Seeing around corners: fast orthogonal connector routing](https://doi.org/10.1007/978-3-662-44043-8_4). Diagrams 2014.
- <a id="misue95"></a>Misue, Eades, Lai and Sugiyama, 1995. [Layout adjustment and the mental map](https://doi.org/10.1006/jvlc.1995.1010). JVLC 6(2).
- <a id="mondal18"></a>Mondal and Nachmanson, 2018. [A new approach to GraphMaps](https://www.scitepress.org/Papers/2018/66181/). IVAPP 2018.
- <a id="moreton93"></a>Moreton, 1993. [Minimum curvature variation curves, networks, and surfaces for fair free-form shape design](https://www2.eecs.berkeley.edu/Pubs/TechRpts/1993/5219.html). UCB/CSD-93-732.
- <a id="nachmanson15"></a>Nachmanson, Prutkin, Lee, Riche, Holroyd and Chen, 2015. [GraphMaps: browsing large graphs as interactive maps](https://arxiv.org/abs/1506.06745). GD 2015.
- <a id="newman04"></a>Newman and Girvan, 2004. [Finding and evaluating community structure in networks](https://arxiv.org/abs/cond-mat/0308217). Physical Review E 69.
- <a id="nguyen17"></a>Nguyen and Eades, 2017. [Towards faithful graph visualizations](https://arxiv.org/abs/1701.00921). It extends Nguyen, Eades and Hong, "On the faithfulness of graph visualizations", PacificVis 2013.
- <a id="perlin93"></a>Perlin and Fox, 1993. [Pad: an alternative approach to the computer interface](https://doi.org/10.1145/166117.166125). SIGGRAPH 1993.
- <a id="pupyrev16"></a>Pupyrev, Nachmanson, Bereg and Holroyd, 2016. [Edge routing with ordered bundles](https://arxiv.org/abs/1209.4227). Computational Geometry 52.
- <a id="purchase97"></a>Purchase, 1997. [Which aesthetic has the greatest effect on human understanding?](https://doi.org/10.1007/3-540-63938-1_67) GD 1997.
- <a id="purchase02"></a>Purchase, 2002. [Metrics for graph drawing aesthetics](https://research.monash.edu/en/publications/metrics-for-graph-drawing-aesthetics/). JVLC 13(5).
- <a id="rousseeuw87"></a>Rousseeuw, 1987. [Silhouettes: a graphical aid to the interpretation and validation of cluster analysis](https://doi.org/10.1016/0377-0427%2887%2990125-7). J. Comput. Appl. Math. 20.
- <a id="saga16"></a>Saga, 2016. [Quantitative evaluation for edge bundling by difference of edge lengths and area occupation](https://diglib7.eg.org/bitstream/handle/10.2312/eurp20161131/017-019.pdf). EuroVis 2016 posters.
- <a id="vargha00"></a>Vargha and Delaney, 2000. [A critique and improvement of the CL common language effect size statistics of McGraw and Wong](https://doi.org/10.3102/10769986025002101). JEBS 25(2).
- <a id="wallinger22"></a>Wallinger, Archambault, Auber, Nöllenburg and Peltonen, 2022. [Edge-path bundling: a less ambiguous edge bundling approach](https://arxiv.org/abs/2108.05467). IEEE TVCG 28(1).
- <a id="ware02"></a>Ware, Purchase, Colpoys and McGill, 2002. [Cognitive measurements of graph aesthetics](https://ccom.unh.edu/publications/cognitive-measurements-graph-aesthetics). Information Visualization 1(2).
- <a id="wybrow09"></a>Wybrow, Marriott and Stuckey, 2009. [Orthogonal connector routing](https://doi.org/10.1007/978-3-642-11805-0_22). GD 2009. The library `libavoid` of Adaptagrams implements it.
- <a id="yuksel11"></a>Yuksel, Schaefer and Keyser, 2011. [Parameterization and applications of Catmull-Rom curves](https://cemyuksel.com/research/catmullrom_param/). Computer-Aided Design 43(7).
- <a id="zitzler99"></a>Zitzler and Thiele, 1999. [Multiobjective evolutionary algorithms: a comparative case study and the strength Pareto approach](https://doi.org/10.1109/4235.797969). IEEE TEC 3(4).

[ahmed24]: #ahmed24
[arcuri11]: #arcuri11
[archambault11]: #archambault11
[bennett07]: #bennett07
[bridgeman00]: #bridgeman00
[das97]: #das97
[dasgupta16]: #dasgupta16
[dunne09]: #dunne09
[efron79]: #efron79
[eiter94]: #eiter94
[elmqvist10]: #elmqvist10
[formann93]: #formann93
[gansner04]: #gansner04
[gansner11]: #gansner11
[hobby86]: #hobby86
[holten06]: #holten06
[holten09]: #holten09
[horn83]: #horn83
[huang08]: #huang08
[huang14]: #huang14
[hubert85]: #hubert85
[kannan04]: #kannan04
[kendall38]: #kendall38
[kieffer16]: #kieffer16
[kobourov12]: #kobourov12
[levien09]: #levien09
[lhuillier17]: #lhuillier17
[luxburg10]: #luxburg10
[magnanti84]: #magnanti84
[marler04]: #marler04
[marriott14]: #marriott14
[misue95]: #misue95
[mondal18]: #mondal18
[moreton93]: #moreton93
[nachmanson15]: #nachmanson15
[newman04]: #newman04
[nguyen17]: #nguyen17
[perlin93]: #perlin93
[pupyrev16]: #pupyrev16
[purchase97]: #purchase97
[purchase02]: #purchase02
[rousseeuw87]: #rousseeuw87
[saga16]: #saga16
[vargha00]: #vargha00
[wallinger22]: #wallinger22
[ware02]: #ware02
[wybrow09]: #wybrow09
[yuksel11]: #yuksel11
[zitzler99]: #zitzler99
