# Ways to make highways

This note is the research item HWY-R of the [roadmap](../ROADMAP.md). It answers one question: when, where and how does the library make a highway?

A highway is a shared way that a bundle of edges follows. Two later items use this note:

- HWY-STEP makes a strategy step `highway`. The section [The contract of the step](#the-contract-of-the-step) gives its input and its output.
- BUILD-W builds and screens each idea. The section [The ranking and the build order](#the-ranking-and-the-build-order) gives the order.

The measures (`B1`, `R5`, `Z10` and the others) come from [the measures of a good result](MEASURES.md). The file [`ideas/highway.json`](ideas/highway.json) holds one record for each idea. A record has the mechanism, the math, the cost, the options, the measures, the screen and the size of a prototype.

## Summary

- The note gives 60 ideas in four groups. The groups are edge bundling (22), clustering of edges (13), network design (10) and dynamic rules (15).
- 32 ideas come from the literature, 11 are hybrids and 17 are our own. Thus 28 of 60 ideas are ours or hybrids.
- The router `shared` is already a heuristic of fixed-charge network design. A link that `k` edges of one key use costs `len (1 + (k - 1) discount)`.
- A cost `f^α` for a link with `f` edges sets the when, the where and the merge angle with one number. Two equal flows merge with a half angle `θ`, and `cos θ = 2^(α - 1)`.
- Two parallel edges at the gap `d` save ink only if they share more than `d √((2 + t) / (2 - t))`. With one line for the shared part (`t = 1`), the limit is `1.73 d`.
- The merge angle limit of 40° of Gansner and others agrees with `α ≈ 0.62`. A single number thus ties the rule to `B1` and `B6`.
- Most bundling methods move curves. They give no explicit highway, and they ignore the boxes. Each such idea here gets a snap step and a box mask.
- The build order has 14 steps. The first five are corridor signatures, merge and split points, the thresholds, the guards and QuickBundles.

## The state of today

Three routers make highways today. Each one decides them inside its own search.

| Router | When | Where | How |
|---|---|---|---|
| `trunks` | The edges of one `GroupRule` key leave one source plug, and the group has `minSize` (2) edges or more. | From the plug to a split point at the share `split` (0.5) toward the center of the targets. | One trunk, then one branch to each target. The options `laneOrder` and `leave` set the lanes and the exits. |
| `shared`, `shared-all` | Two or more edges of one key use one link of the corner graph. | On the links where the routes of one key meet. | Each edge routes in turn, the longest first. A link that the key already uses costs `discount` (0.5) times its length. |
| `sections`, `sections-tree` | Edges go between two sections of the tree of sections. | Through the hubs of the sections. | A hub joins an edge when its detour stays below `stretch` (2) times its length plus `stretchPad` (4). |

Three limits follow from this design:

- The decision sits inside each router. Thus each new rule needs a new router.
- The key decides the groups. Thus edges of two keys do not share a way, even when they run side by side.
- The count rule is one number with no memory. Thus an edit near the limit makes a highway appear and disappear.

## The contract of the step

The proposed step `highway` takes four inputs:

- `graph`: the boxes and the edges.
- `routes`: the first routes. This input is optional, and the default is the router `corners`.
- `sections`: the tree of the group step. This input is optional.
- `zoom`: the level. This input is optional.

The step gives a highway plan. Each highway of the plan has these fields:

- `id` and `key`.
- `spine`: a list of points.
- `edges`: the edges, in lane order.
- `on` and `off`: for each edge, the index of its on-ramp and of its off-ramp on the spine.
- `width` and `levels`: the width and the range of zoom levels.

A router `follow` then makes the ramps with `WayFinder.fromPlug` and `WayFinder.toPlug`. It gives `Bundle` and `SharedRun` records, as the routers do today.

Each idea reads one of four kinds of input. The column Mode of the [index](#the-index-of-the-ideas) gives the kind of each idea.

| Mode | Input | Effect |
|---|---|---|
| A | The boxes and the straight lines | Fast. The idea does not see the boxes before its snap step. |
| B | The first routes | One more run of `corners`. Each highway stays in the free space. |
| C | The path search | The idea stays a router, or it gives a link cost to the step. |
| G | The graph, with no geometry | The idea does not depend on the placement. A spine rule follows it. |
| any | The output of another idea | A rule over the other ideas. |

## The taxonomy

| Group | The question that it answers | Ideas | Literature | Hybrid | Ours |
|---|---|---|---|---|---|
| [Edge bundling](#edge-bundling) | How the edges of a highway gather and look | HWY-001 to HWY-022 | 20 | 2 | 0 |
| [Clustering of edges](#clustering-of-edges) | Which edges belong to one highway | HWY-023 to HWY-035 | 6 | 5 | 2 |
| [Network design](#network-design) | Where a highway runs, and what it costs | HWY-036 to HWY-045 | 6 | 2 | 2 |
| [Dynamic rules](#dynamic-rules) | When a highway forms, splits, changes its width or changes with the zoom | HWY-046 to HWY-060 | 0 | 2 | 13 |
| All | | 60 | 32 | 11 | 17 |

### The index of the ideas

The column Tier comes from the [ranking](#the-ranking-and-the-build-order). The column Size is the size of a prototype: S, M or L.

| Id | Idea | Kind | Step | Mode | Size | Tier |
|---|---|---|---|---|---|---|
| [HWY-001](#hwy-001) | Hierarchical edge bundling along the tree of sections | literature | `highway` | G | S | 3 |
| [HWY-002](#hwy-002) | Force-directed edge bundling (FDEB) with box repulsion | literature | `highway` | A | M | 3 |
| [HWY-003](#hwy-003) | Multilevel agglomerative edge bundling (MINGLE) | literature | `highway` | A | M | 2 |
| [HWY-004](#hwy-004) | Geometry-based edge clustering with a control mesh | literature | `highway` | A | M | 3 |
| [HWY-005](#hwy-005) | Winding Roads: grid routing with a reuse discount | literature | `router` | C | S | 2 |
| [HWY-006](#hwy-006) | Kernel density estimation edge bundling (KDEEB) with an obstacle mask | literature | `highway` | A | M | 3 |
| [HWY-007](#hwy-007) | Fast density bundling: CUBu and FFTEB | literature | `highway` | A | S | 3 |
| [HWY-008](#hwy-008) | Moving least squares bundling (MLSEB) | literature | `highway` | A | M | 3 |
| [HWY-009](#hwy-009) | Skeleton-based edge bundling (SBEB): the skeleton is the spine | literature | `highway` | A | M | 3 |
| [HWY-010](#hwy-010) | Image-based edge bundles: a highway as a shaded area | literature | `highway` | A | M | 3 |
| [HWY-011](#hwy-011) | Divided edge bundling: two-way highways with sides | literature | `highway` | A | S | 2 |
| [HWY-012](#hwy-012) | Edge-path bundling: ride along the routes of a graph path | literature | `highway` | G | M | 2 |
| [HWY-013](#hwy-013) | Confluent drawings: junctions as train tracks | literature | `highway` | G | M | 3 |
| [HWY-014](#hwy-014) | Edge compression: modules and power graphs | literature | `highway` | G | M | 3 |
| [HWY-015](#hwy-015) | Stub bundling at both ends | literature | `highway` | A | S | 1 |
| [HWY-016](#hwy-016) | Ordered bundles with channel capacity (metro-line style) | literature | `router` | C | S | 2 |
| [HWY-017](#hwy-017) | Flow maps with spiral trees for a fan-out | literature | `highway` | A | M | 2 |
| [HWY-018](#hwy-018) | Clustered edge routing with the WSPD | literature | `highway` | A | M | 2 |
| [HWY-019](#hwy-019) | Attribute-driven bundling: soft keys | hybrid | `highway` | A | S | 2 |
| [HWY-020](#hwy-020) | Route-aware bundling on the corner graph | hybrid | `highway` | B | S | 2 |
| [HWY-021](#hwy-021) | Spectral bundling by effective resistance | literature | `highway` | G | M | 3 |
| [HWY-022](#hwy-022) | Bundled crossings | literature | `highway` | B | M | 3 |
| [HWY-023](#hwy-023) | End point clustering in 4D (flow clustering) | literature | `highway` | A | S | 2 |
| [HWY-024](#hwy-024) | Hough voting for corridors | hybrid | `highway` | A | S | 2 |
| [HWY-025](#hwy-025) | Segment clustering of the first routes (TRACLUS) | literature | `highway` | B | M | 2 |
| [HWY-026](#hwy-026) | QuickBundles: one pass with a distance threshold | literature | `highway` | A | S | 1 |
| [HWY-027](#hwy-027) | Subtrajectory clustering by Fréchet distance | literature | `highway` | B | L | 3 |
| [HWY-028](#hwy-028) | HDBSCAN on edges with a compatibility distance | hybrid | `highway` | A | M | 2 |
| [HWY-029](#hwy-029) | Spectral clustering of the compatibility graph | hybrid | `highway` | A | M | 3 |
| [HWY-030](#hwy-030) | Link communities on the line graph | literature | `highway` | G | M | 3 |
| [HWY-031](#hwy-031) | Corridor signatures: overlap of the first routes | ours | `highway` | B | S | 1 |
| [HWY-032](#hwy-032) | Ridges of the line density in one pass | ours | `highway` | A | S | 2 |
| [HWY-033](#hwy-033) | Territory aggregation of flows | literature | `highway` | B | M | 3 |
| [HWY-034](#hwy-034) | Route betweenness on the corner graph (road classes) | hybrid | `highway` | B | S | 1 |
| [HWY-035](#hwy-035) | Consensus of clusterings | hybrid | `highway` | A | M | 3 |
| [HWY-036](#hwy-036) | Obstacle-avoiding rectilinear Steiner tree for a group | literature | `highway` | A | M | 3 |
| [HWY-037](#hwy-037) | Steiner arborescence for a fan-out | literature | `highway` | A | S | 1 |
| [HWY-038](#hwy-038) | Branched transport: cost f^alpha (Gilbert, Xia) | hybrid | `highway` | A | M | 2 |
| [HWY-039](#hwy-039) | Buy-at-bulk with concave link costs and rip-up | literature | `router` | C | S | 2 |
| [HWY-040](#hwy-040) | Fixed-charge network design, exact on small boards | literature | `highway` | C | L | 3 |
| [HWY-041](#hwy-041) | Hub location (p-hub median) | literature | `highway` | A | M | 3 |
| [HWY-042](#hwy-042) | Hub arc location: choose q highways | literature | `highway` | A | M | 2 |
| [HWY-043](#hwy-043) | Meeting points by Weiszfeld with a weighted trunk | hybrid | `highway` | A | S | 1 |
| [HWY-044](#hwy-044) | Negotiated attraction (PathFinder turned around) | ours | `router` | C | M | 3 |
| [HWY-045](#hwy-045) | Candidate generation and selection | ours | `highway` | B | M | 2 |
| [HWY-046](#hwy-046) | Count threshold with hysteresis | ours | `highway` | any | S | 1 |
| [HWY-047](#hwy-047) | Break-even overlap law | ours | `highway` | A | S | 1 |
| [HWY-048](#hwy-048) | Stretch budget for each edge (join test) | ours | `highway` | B | S | 1 |
| [HWY-049](#hwy-049) | Ambiguity guard | ours | `highway` | G | S | 1 |
| [HWY-050](#hwy-050) | Merge and split points where the routes meet and part | ours | `highway` | B | S | 1 |
| [HWY-051](#hwy-051) | Width, lanes and capacity: split a highway that does not fit | ours | `highway` | B | S | 2 |
| [HWY-052](#hwy-052) | Highways for each zoom level that nest | ours | `levels` | any | M | 2 |
| [HWY-053](#hwy-053) | Scale space with persistence | hybrid | `levels` | A | M | 3 |
| [HWY-054](#hwy-054) | Stable highway ids across edits | hybrid | `highway` | any | S | 1 |
| [HWY-055](#hwy-055) | Local growth by accretion and extension | ours | `highway` | B | S | 2 |
| [HWY-056](#hwy-056) | Level links become highways | ours | `highway` | G | S | 2 |
| [HWY-057](#hwy-057) | Gap highways | ours | `highway` | B | M | 3 |
| [HWY-058](#hwy-058) | Orthogonal streets by set cover | ours | `highway` | A | M | 3 |
| [HWY-059](#hwy-059) | Local search over the highway set on the measures | ours | `highway` | B | M | 3 |
| [HWY-060](#hwy-060) | Interchanges: a network of highways | ours | `highway` | B | L | 3 |

## The derived formulas

These formulas come from the cost model of branched transport ([Gilbert 1967][gilbert67], [Xia 2003][xia03]). A scratch script checked each one with a numeric search.

### The cost of a shared link

A link of the length `len` that carries `f` edges costs `f^α len`, with `0 ≤ α ≤ 1`. With `α = 1`, sharing saves nothing. With `α = 0`, a link costs the same for any count of edges, and the best network is a Steiner tree. The saving for each unit of length with `k` lanes is `k - k^α`.

### The merge angle

Two equal flows that merge into one trunk each make the half angle `θ` with the trunk, and `cos θ = 2^(α - 1)`.

| `α` | Half angle `θ` | Angle between the two flows |
|---|---|---|
| 0 | 60° | 120° |
| 0.25 | 53.5° | 107° |
| 0.5 | 45° | 90° |
| 0.62 | 40° | 80° |
| 0.75 | 32.8° | 65.5° |
| 1 | 0° | 0° |

[Gansner and others][gansner11] limit the turn at a meeting point to 40°. This limit agrees with `α ≈ 0.62`. The measure `B6` thus tells which `α` a result follows.

### The break-even overlap

Two parallel edges at the gap `d` share a stretch of the length `L`. Let `t = 2^α` be the cost of the shared stretch for each unit of length. The merged pair has the least ink with merge legs at the offset `x = t d / (2 √(4 - t²))` from each end. Its ink is `t L + d √(4 - t²)`. The two edges alone have the ink `2 L`.

Thus a merge saves ink only if `L > L* = d √((2 + t) / (2 - t))`.

| `α` | `t` | `L* / d` |
|---|---|---|
| 0 | 1 | 1.73 |
| 0.5 | 1.41 | 2.42 |
| 0.7 | 1.62 | 3.11 |
| 0.9 | 1.87 | 5.38 |

The rule [HWY-047](#hwy-047) uses this limit as a filter. A short or wide overlap then does not make a highway that adds ink.

### The discount of `shared` as a fixed charge

The router `shared` gives the cost `len (1 + (k - 1) δ)` to a link with `k` edges and the discount `δ`. This cost is a fixed charge `len (1 - δ)` plus a cost `len δ` for each edge. Thus `shared` is a greedy heuristic of fixed-charge network design ([Magnanti and Wong 1984][magnanti84]). The order of the edges changes its result. The idea [HWY-039](#hwy-039) adds passes that route each edge again.

## Edge bundling

These ideas come from the visualization literature. Most of them move the points of curves, and they give no explicit highway. Each one here gets a snap step that turns its gathered curves into spines, and a mask for the boxes.

### HWY-001 Hierarchical edge bundling along the tree of sections

Kind: literature. Step: `highway`. Mode: G. Prototype: S. Depends on the placement: yes.

- **What it does.** Each edge follows the path of hub points from its source section up to the lowest common section and down to its target section. A straightness value beta pulls the path toward the straight line. Edges with the same section path share the spine between the hubs.
- **Math.** `Control points P = hubs on path(s, lca, t). Bundled point p_i' = beta p_i + (1 - beta)(s + (i/(k-1))(t - s)). Highway = maximal run of hubs shared by >= minSize edges.`
- **Cost.** `O(m depth)` after the group step. 100 nodes: < 5 ms. 1000 nodes: < 30 ms, plus the ramps through the corner graph.
- **Options.** `beta 0..1 (default 0.85)`, `minSize 2..16`, `hubs per side 1..depth`, `group strategy (quadtree, kd, cut)`.
- **Improves.** `B1`, `B2`, `B8`, `G8`, `Z9`. **Risks.** `B3`, `B4`, `R5`, `R7`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B1` ≥ `sections` at the same `B3` q95 on 3 of 5 boards with `R7` = 0. Drop if `B4` > 1.2 times `sections`.
- **Sources.** [Holten 2006][holten06].
- **Related.** [HWY-052](#hwy-052), [HWY-056](#hwy-056), [HWY-041](#hwy-041).

### HWY-002 Force-directed edge bundling (FDEB) with box repulsion

Kind: literature. Step: `highway`. Mode: A. Prototype: M. Depends on the placement: yes.

- **What it does.** Each edge gets subdivision points. Springs keep each edge smooth. Compatible edges attract their matching points. Boxes repel the points. After the cycles, points of different edges that come within the lane width snap together, and each snapped run with enough edges is a highway.
- **Math.** `F_i = k_p(|p_{i-1}-p_i| + |p_{i+1}-p_i|) + sum_{q compatible} C(P,Q)/|p_i - q_i| - sum_{boxes} repel. C = Ca Cs Cp Cv (angle, scale, position, visibility), keep pairs with C >= 0.6.`
- **Cost.** `O(c P I)` for c compatible pairs, P points per edge, I steps (6 cycles, P doubles). 100 nodes: 50 to 150 ms. 1000 nodes: 2 to 10 s with a grid for the pairs.
- **Options.** `compatibility threshold 0.3..0.9`, `k spring 0.05..0.5`, `cycles 3..8`, `points per edge 8..64`, `box repulsion 0..4`, `snap width 0.5..2 lanes`.
- **Improves.** `B1`, `B7`, `B2`. **Risks.** `R9`, `B4`, `B3`, `C5`, `Z10`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `R9` = 0 after snapping and `B1` > `shared` at `B3` q95 within 10% on 3 of 5 boards. Drop if 1000 nodes takes > 5x `shared`.
- **Sources.** [Holten and van Wijk 2009][holten09].
- **Related.** [HWY-006](#hwy-006), [HWY-028](#hwy-028), [HWY-019](#hwy-019).

### HWY-003 Multilevel agglomerative edge bundling (MINGLE)

Kind: literature. Step: `highway`. Mode: A. Prototype: M. Depends on the placement: yes.

- **What it does.** Each edge is a point in 4D (its two ends). A k-nearest-neighbour graph of these points gives merge candidates. Two neighbours merge into one bundle when the ink of the bundle with its two meeting points is less than the sum of their inks. The merges repeat on the coarser graph, level by level.
- **Math.** `Gain(A,B) = ink(A) + ink(B) - ink(A u B). ink(G) = sum |s_i - M1| + |M1 - M2| + sum |M2 - t_i| with M1, M2 the optimal meeting points (Weiszfeld). Merge while gain > 0 and the turn at M1, M2 <= 40 deg.`
- **Cost.** `O(m log m)` per level with a k-d tree, 4 to 8 levels. 100 nodes: < 10 ms. 1000 nodes: 30 to 100 ms, plus routes of the ramps and `trunks`.
- **Options.** `k neighbours 4..16`, `max turn 20..60 deg`, `levels 1..10`, `trunk weight 0.5..1`.
- **Improves.** `B1`, `B2`, `B8`, `R1`. **Risks.** `B3`, `B4`, `B6`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B1` ≥ `shared` and `B3` q95 ≤ `shared` on 3 of 5 boards. Drop if `B4` > 1.2 times `shared`.
- **Sources.** [Gansner and others 2011][gansner11], [Gansner and Koren 2006][gansner06].
- **Related.** [HWY-043](#hwy-043), [HWY-047](#hwy-047), [HWY-045](#hwy-045).

### HWY-004 Geometry-based edge clustering with a control mesh

Kind: literature. Step: `highway`. Mode: A. Prototype: M. Depends on the placement: yes.

- **What it does.** A mesh covers the free space. Its edges follow the main local direction of the straight lines. Where many lines cross one mesh edge, their crossing points cluster to a few control points. Each edge goes through the control points of its clusters, so edges of one cluster share a way.
- **Math.** `Grid of cells, dominant direction per cell from the angle histogram of the lines. Constrained Delaunay mesh along those directions. On each mesh edge, k-means of the crossing points, k = ceil(count / capacity).`
- **Cost.** `O(m cells_crossed + mesh)` . 100 nodes: 10 to 30 ms. 1000 nodes: 100 to 300 ms.
- **Options.** `cell size 2..8 u`, `capacity of a control point 2..32`, `merge distance 0.5..3 u`.
- **Improves.** `B1`, `B7`, `R1`. **Risks.** `R9`, `B4`, `R4`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Use the corner graph as the mesh. Keep if `B1` > `shared` on 3 of 5 boards at `R9` = 0.
- **Sources.** [Cui and others 2008][cui08].
- **Related.** [HWY-020](#hwy-020), [HWY-057](#hwy-057).

### HWY-005 Winding Roads: grid routing with a reuse discount

Kind: literature. Step: `router`. Mode: C. Prototype: S. Depends on the placement: yes.

- **What it does.** A quadtree or Voronoi grid covers the board. Each edge takes a shortest path in the grid. After each pass, the weight of each grid edge drops with its use, so the next pass attracts more edges to the busy grid edges. Shared grid edges become highways.
- **Math.** `w_k(e) = len(e) / (1 + lambda use_{k-1}(e))^gamma. Repeat shortest paths for K passes. Highway = grid edge chain with use >= minSize.`
- **Cost.** `O(K m (V log V))` for the grid with V nodes. 100 nodes: 50 ms for K = 3. 1000 nodes: 1 to 3 s.
- **Options.** `passes K 1..6`, `lambda 0..2`, `gamma 0.5..2`, `grid: quadtree or corner graph`.
- **Improves.** `B1`, `B2`, `B8`. **Risks.** `B3`, `R5`, `B4`, `Z10`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Run it on the corner graph. Keep if 2 passes beat `shared` (1 pass) on `B1` at equal `B3` q95 on 3 of 5 boards.
- **Sources.** [Lambert and others 2010][lambert10].
- **Related.** [HWY-039](#hwy-039), [HWY-044](#hwy-044), [HWY-034](#hwy-034).

### HWY-006 Kernel density estimation edge bundling (KDEEB) with an obstacle mask

Kind: literature. Step: `highway`. Mode: A. Prototype: M. Depends on the placement: yes.

- **What it does.** The straight lines or first routes draw a density image. Each sample point of each edge moves up the gradient of the density. The bandwidth shrinks each step, so the edges gather into ridges. Boxes are a mask with zero density and a push out. The final ridges are the highway spines.
- **Math.** `rho(x) = sum_e sum_samples K_h(x - p). p <- p + eps grad rho(p) / |grad rho(p)|. h_{k+1} = 0.7 h_k. Then Laplacian smoothing of each polyline.`
- **Cost.** `O(I (S + W H))` for S samples and an image of W x H pixels. 100 nodes: 30 to 80 ms at 256^2. 1000 nodes: 0.3 to 1 s at 512^2.
- **Options.** `start bandwidth 2..16 u`, `decay 0.5..0.9`, `steps 5..20`, `image size 128..1024`, `smoothing 0..1`.
- **Improves.** `B1`, `B7`, `B2`. **Risks.** `R9`, `B4`, `R5`, `Z10`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B1` > `shared` and `R9` = 0 after the mask on 3 of 5 boards. Drop if the ridges need > 1 s at 1000 nodes in CI.
- **Sources.** [Hurter and others 2012][hurter12].
- **Related.** [HWY-007](#hwy-007), [HWY-032](#hwy-032), [HWY-053](#hwy-053).

### HWY-007 Fast density bundling: CUBu and FFTEB

Kind: literature. Step: `highway`. Mode: A. Prototype: S. Depends on the placement: yes.

- **What it does.** The same advection as KDEEB, but the density comes from a separable kernel (CUBu) or from a product in the frequency domain (FFTEB). Resampling keeps the sample spacing even. This makes a density step cheap enough to run at each zoom.
- **Math.** `rho = splat * K_h. CUBu: two 1D convolutions, O(W H h). FFTEB: rho = IFFT(FFT(splat) . FFT(K_h)), O(W H log(W H)), with no dependence on h.`
- **Cost.** `O(I W H log(W H))`. 100 nodes: 10 to 30 ms. 1000 nodes: 80 to 250 ms on the CPU at 512^2.
- **Options.** `as KDEEB`, `kernel: separable or FFT`, `resample step 0.5..4 u`.
- **Improves.** `B1`, `B7`. **Risks.** `R9`, `B4`, `Z10`.
- **Screen.** Same as KDEEB. Keep only if KDEEB is kept and the FFT form gives the same `B1` within 2% at 3x less time.
- **Sources.** [van der Zwan and others 2016][zwan16], [Lhuillier and others 2017][lhuillier17].
- **Related.** [HWY-006](#hwy-006), [HWY-053](#hwy-053).

### HWY-008 Moving least squares bundling (MLSEB)

Kind: literature. Step: `highway`. Mode: A. Prototype: M. Depends on the placement: yes.

- **What it does.** Each sample point moves to a local least squares fit of the samples of the other edges near it. The weight falls with the distance and the angle. The moves repeat with a shrinking radius. The edges converge onto shared local lines, which become the highway spines.
- **Math.** `For a point p, fit a line or a parabola f to the samples q within r, weights w = exp(-|q-p|^2 / r^2) cos(angle). p <- projection of p on f. r_{k+1} = 0.8 r_k.`
- **Cost.** `O(I S k)` for k neighbours per sample with a grid. 100 nodes: 20 to 60 ms. 1000 nodes: 0.3 to 1 s.
- **Options.** `start radius 2..12 u`, `decay 0.6..0.9`, `steps 3..12`, `fit: line or parabola`, `angle weight 0..1`.
- **Improves.** `B1`, `B7`, `C3`. **Risks.** `R9`, `B4`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B1` ≥ KDEEB at lower `C3` on 3 of 5 boards. It is a second choice behind KDEEB.
- **Sources.** [Wu and others 2017][wu17].
- **Related.** [HWY-006](#hwy-006), [HWY-009](#hwy-009).

### HWY-009 Skeleton-based edge bundling (SBEB): the skeleton is the spine

Kind: literature. Step: `highway`. Mode: A. Prototype: M. Depends on the placement: yes.

- **What it does.** A clusterer gives groups of edges. Each group draws a thick shape, the union of its edges with a radius. The medial axis (skeleton) of the shape is the highway spine. Each edge moves toward the skeleton, and the skeleton points where edges join or leave give the ramps.
- **Math.** `Shape = union of disks of radius r along the edges, minus the boxes. Skeleton by the distance transform and its ridge. Attraction p <- p + a (closest skeleton point - p), a falls with the distance.`
- **Cost.** `O(groups x W H)` for the distance transforms. 100 nodes: 20 to 60 ms. 1000 nodes: 0.2 to 0.8 s.
- **Options.** `shape radius 1..6 u`, `attraction 0..1`, `steps 1..10`, `clusterer (any of HWY-023 to HWY-031)`.
- **Improves.** `B1`, `B9`, `C3`, `B6`. **Risks.** `R9`, `B3`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Compare the skeleton spine against the mean polyline of each cluster. Keep if `B6` is lower at equal `B1` on 3 of 5 boards.
- **Sources.** [Ersoy and others 2011][ersoy11].
- **Related.** [HWY-026](#hwy-026), [HWY-025](#hwy-025), [HWY-050](#hwy-050).

### HWY-010 Image-based edge bundles: a highway as a shaded area

Kind: literature. Step: `highway`. Mode: A. Prototype: M. Depends on the placement: yes.

- **What it does.** Each cluster of edges is drawn as one smooth area with a shade that is darker at its spine. The single edges disappear at a far zoom. The highway thus has a shape and a width, not only a line. A closer zoom opens the area into lanes.
- **Math.** `Area = offset of the cluster skeleton by the local spread of its edges. Shade = distance to the skeleton / local half width.`
- **Cost.** `O(groups x W H)`. 100 nodes: 20 to 50 ms. 1000 nodes: 0.2 to 0.5 s. A renderer can do it on the GPU.
- **Options.** `width rule: spread or count`, `shade curve`, `zoom where lanes open`.
- **Improves.** `B7`, `Z4`. **Risks.** `B4`, `B9`.
- **Screen.** A renderer test, not a measure test. Keep as an output option if `B7` drops by 20% on the far view of 3 boards.
- **Sources.** [Telea and Ersoy 2010][telea10].
- **Related.** [HWY-009](#hwy-009), [HWY-052](#hwy-052).

### HWY-011 Divided edge bundling: two-way highways with sides

Kind: literature. Step: `highway`. Mode: A. Prototype: S. Depends on the placement: no.

- **What it does.** Edges of opposite directions in one corridor go on two sides of the spine, as traffic on a road. Edges of one direction attract each other. Edges of opposite direction attract a point at a fixed offset. The highway thus has two carriageways, and a reader sees the direction.
- **Math.** `Target of p_i for an opposite edge q: q_i + o n(q_i), with n the left normal and o the half width. Compatibility as FDEB. Lane order by direction first, then by the lane order of today.`
- **Cost.** The cost of the base method plus `O(m)`. In the lane order only: `O(m log m)`.
- **Options.** `side offset 1..4 lanes`, `rule: left-hand or right-hand traffic`.
- **Improves.** `B5`, `B9`, `R1`. **Risks.** `B1`.
- **Screen.** Boards with edges in both directions: `case-many-groups`, `small-clustered`. Keep if `B5` drops by 20% at a `B1` loss < 5%.
- **Sources.** [Selassie and others 2011][selassie11].
- **Related.** [HWY-051](#hwy-051), [HWY-016](#hwy-016).

### HWY-012 Edge-path bundling: ride along the routes of a graph path

Kind: literature. Step: `highway`. Mode: G. Prototype: M. Depends on the placement: yes.

- **What it does.** For each long edge, find a shortest path between its ends through other edges of the graph. Its length is at most k times the length of the edge. If such a path exists, the edge rides next to the routes of that path. Bundles then always follow real paths, so they show no false link.
- **Math.** `Weight w(e) = len(e)^d. Process edges by decreasing length. Bundle e = (s,t) along P if len(P) <= k len(e) and no edge of P is bundled. Each middle node is passed at the clearance, never through.`
- **Cost.** `O(m (m + n log n))` with Dijkstra per edge, less with a spanner. 100 nodes: 20 to 50 ms. 1000 nodes: 1 to 4 s, 0.2 to 0.6 s with the spanner.
- **Options.** `k max distortion 1.5..4`, `d edge weight power 1..3`, `spanner stretch 1.5..3`.
- **Improves.** `B4`, `B1`. **Risks.** `B3`, `R5`, `R8`, `R9`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B4` < 0.5 times `shared` at `B1` ≥ 0.8 times `shared` on 3 of 5 boards, with `R9` = 0.
- **Sources.** [Wallinger and others 2022][wallinger22], [Wallinger and others 2023][wallinger23].
- **Related.** [HWY-049](#hwy-049), [HWY-021](#hwy-021), [HWY-030](#hwy-030).

### HWY-013 Confluent drawings: junctions as train tracks

Kind: literature. Step: `highway`. Mode: G. Prototype: M. Depends on the placement: no.

- **What it does.** Edges merge smoothly at junctions, as train tracks. A biclique of edges between node sets A and B becomes one track. The track has a merge junction near the first set and a split junction near the second set. A path from u to v that turns smoothly at each junction is an edge, so the drawing is exact.
- **Math.** `Find bicliques K(A,B) with |A| |B| >= q. Replace |A| |B| edges by |A| + |B| + 1 curves. Junction angles below the smooth limit. Recognition is NP-hard in general, so use a greedy biclique search.`
- **Cost.** Greedy bicliques `O(m°)`. 100 nodes: < 10 ms. 1000 nodes: 20 to 80 ms, plus the routes.
- **Options.** `min biclique size q 4..16`, `junction distance from the boxes 1..6 u`.
- **Improves.** `B1`, `B4`, `R1`, `B8`. **Risks.** `B3`, `B6`.
- **Screen.** Boards with dense key groups: `case-dense-groups`, `mid-fanout`. Keep if `R1` drops by 15% with `B4` = 0 for the confluent tracks.
- **Sources.** [Dickerson and others 2005][dickerson05].
- **Related.** [HWY-014](#hwy-014), [HWY-030](#hwy-030), [HWY-049](#hwy-049).

### HWY-014 Edge compression: modules and power graphs

Kind: literature. Step: `highway`. Mode: G. Prototype: M. Depends on the placement: no.

- **What it does.** Nodes with the same neighbours form a module. All edges between two modules become one power edge, drawn as one highway from module to module. Nested modules give nested highways. The compression is lossless, so the highway is exact.
- **Math.** `Modular decomposition in O(n + m). Power graph: greedy merge of node sets by the count of edges saved, |A||B| - 1 for each new power edge.`
- **Cost.** `O(n + m)` for modules. Power graph greedy `O(m^1.5)`. 100 nodes: < 10 ms. 1000 nodes: 20 to 200 ms.
- **Options.** `min edges saved 2..16`, `nesting depth 1..4`, `module source: exact or near (Jaccard >= 0.8)`.
- **Improves.** `B4`, `B1`, `R1`. **Risks.** `B3`, `G5`.
- **Screen.** Boards with real modules: `mid-fanout`, `case-dense-groups`. Keep if the edges in power edges are > 20% with `B4` = 0 on 2 of 2 boards.
- **Sources.** [Dwyer and others 2013][dwyer13].
- **Related.** [HWY-013](#hwy-013), [HWY-030](#hwy-030), [HWY-049](#hwy-049).

### HWY-015 Stub bundling at both ends

Kind: literature. Step: `highway`. Mode: A. Prototype: S. Depends on the placement: yes.

- **What it does.** Edges bundle only near their ends. At a node, the edges that leave within an angle window share a short stub. The middle of each edge stays its own. The stubs show the fan of each node with no ambiguity in the middle. The router trunks does this at the source today, and this idea adds the target side.
- **Math.** `At node v, sort the edges by angle. Group runs with an angle spread <= omega. Stub length = min(sigma span, half the distance to the nearest target). Each edge has at most one turn point between its two stubs.`
- **Cost.** `O(m log m)`. 100 nodes: < 5 ms. 1000 nodes: < 20 ms, plus the routes.
- **Options.** `angle window omega 10..60 deg`, `stub share sigma 0.1..0.4`, `ends: source, target or both`, `minSize 2..8`.
- **Improves.** `R11`, `B2`, `B4`. **Risks.** `B1`, `R4`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B4` ≤ `trunks` and `B1` ≥ `trunks` on 3 of 5 boards with the stubs at both ends.
- **Sources.** [Nocaj and Brandes 2013][nocaj13].
- **Related.** [HWY-037](#hwy-037), [HWY-050](#hwy-050).

### HWY-016 Ordered bundles with channel capacity (metro-line style)

Kind: literature. Step: `router`. Mode: C. Prototype: S. Depends on the placement: yes.

- **What it does.** Routes go through a sparse graph of the free space with a discount on shared links, as the router shared does. A channel between two boxes has a capacity from its width. A link whose lanes do not fit costs more, so a highway does not enter a gap that is too narrow. Lanes get a metro-line order.
- **Math.** `cost(e) = len(e) (1 - discount [shared]) + mu max(0, lanes(e) w - width(e)). Lane order by the metro-line crossing minimization of the common subpaths.`
- **Cost.** As `shared` plus `O(1)` per link. 100 nodes: as `shared` + 5%. 1000 nodes: as `shared` + 10%.
- **Options.** `discount 0.05..1`, `lane width w 2..8`, `capacity penalty mu 0..10`.
- **Improves.** `M4`, `B5`, `R8`. **Risks.** `B1`, `R5`.
- **Screen.** Boards: `packedGridBoard` and `case-dense-groups`. Keep if `M4` drops by 50% at a `B1` loss < 10% against `shared`.
- **Sources.** [Pupyrev and others 2016][pupyrev16].
- **Related.** [HWY-051](#hwy-051), [HWY-057](#hwy-057), [HWY-039](#hwy-039).

### HWY-017 Flow maps with spiral trees for a fan-out

Kind: literature. Step: `highway`. Mode: A. Prototype: M. Depends on the placement: yes.

- **What it does.** One source node with many targets gets a branching tree. Each branch is a spiral arc with a fixed angle to the source, so each target path goes away from the source all the time. The tree avoids the boxes. Its trunk and its branches are the highway, with the flow as the width.
- **Math.** `Spiral tree: approximate Steiner arborescence where each path makes angle <= alpha with the line to the root. Merge the two targets with the largest join point first. Width of a branch = k^(1/2) times the lane width, or the count of lanes.`
- **Cost.** `O(k log k)` per source with k targets, plus the box test. 100 nodes: < 10 ms. 1000 nodes: 20 to 80 ms.
- **Options.** `spiral angle alpha 10..40 deg`, `min targets 3..20`, `width rule: lanes or sqrt`.
- **Improves.** `B1`, `B6`, `R4`, `B2`. **Risks.** `R8`, `R9`, `B3`.
- **Screen.** Boards: `mid-fanout` and `case-hub-chain`. Keep if `B1` > `trunks` by 10% at a lower `B6` with `R9` = 0.
- **Sources.** [Buchin and others 2011][buchin11], [Phan and others 2005][phan05].
- **Related.** [HWY-037](#hwy-037), [HWY-036](#hwy-036), [HWY-015](#hwy-015).

### HWY-018 Clustered edge routing with the WSPD

Kind: literature. Step: `highway`. Mode: A. Prototype: M. Depends on the placement: yes.

- **What it does.** A well-separated pair decomposition splits all node pairs into pairs of compact sets (A,B), far apart compared with their size. All edges from A to B form one cluster, and each cluster gets one highway from A to B on a sparse visibility graph. The clusters are compatible by proof.
- **Math.** `Pairs (A,B) with dist(A,B) >= s max(diam A, diam B). O(s^2 n) pairs. Each edge is in exactly one pair. Highway of (A,B) if it has >= minSize edges.`
- **Cost.** `O(n log n + s^2 n)` for the WSPD, `O(m)` to assign. 100 nodes: < 10 ms. 1000 nodes: 20 to 60 ms, plus the routes.
- **Options.** `separation s 1..8`, `minSize 2..16`, `spanner stretch 1.1..2`.
- **Improves.** `B1`, `B2`, `B8`, `Z10`. **Risks.** `B3`, `B4`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B1` ≥ `shared` at `B3` q95 ≤ `shared` on 3 of 5 boards. Check `Z10` against `shared`.
- **Sources.** [Bouts and Speckmann 2015][bouts15], [Callahan and Kosaraju 1995][callahan95].
- **Related.** [HWY-023](#hwy-023), [HWY-056](#hwy-056), [HWY-045](#hwy-045).

### HWY-019 Attribute-driven bundling: soft keys

Kind: hybrid. Step: `highway`. Mode: A. Prototype: S. Depends on the placement: yes.

- **What it does.** Today a key splits the edges into hard groups. Here the key is one more term of the distance between two edges. Other data, for example a weight or a time, add more terms. Edges with other keys can still share a highway when they are very near. Edges with one key do not bundle when they are far.
- **Math.** `d(e,f) = d_geom(e,f) + lambda [key(e) != key(f)] + sum_a w_a |a(e) - a(f)|. Any clusterer of this note takes d.`
- **Cost.** The cost of the clusterer. `O(1)` more per pair.
- **Options.** `key weight lambda 0..inf (inf = today)`, `attribute weights 0..4`.
- **Improves.** `B1`, `B2`. **Risks.** `B4`.
- **Screen.** Boards with keys: `mid-fanout`, `case-dense-groups`. Sweep lambda. Keep if a finite lambda gives a Pareto point of (`B1`, `B4`) that the hard key does not give.
- **Sources.** [Peysakhovich and others 2015][peysakhovich15].
- **Related.** [HWY-028](#hwy-028), [HWY-049](#hwy-049).

### HWY-020 Route-aware bundling on the corner graph

Kind: hybrid. Step: `highway`. Mode: B. Prototype: S. Depends on the placement: yes.

- **What it does.** The density of the edges is spread on the links of the corner graph, not on pixels. A diffusion along the graph smooths it. Then each edge takes a shortest path where a dense link costs less. Highways appear on the dense links, and they always stay in the free space.
- **Math.** `rho_0(l) = number of first routes on link l. rho_{k+1} = (1 - a) rho_k + a mean_{l' adjacent} rho_k(l'). cost(l) = len(l) / (1 + lambda rho(l))^gamma.`
- **Cost.** `O(K L + m L log L)` for L links. 100 nodes: 30 to 60 ms. 1000 nodes: 0.5 to 1.5 s.
- **Options.** `diffusion a 0..0.5`, `diffusion steps K 0..10`, `lambda 0..2`, `gamma 0.5..2`.
- **Improves.** `B1`, `B2`, `R9`. **Risks.** `B3`, `R5`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B1` > `shared` at the same `B3` q95 on 3 of 5 boards, with `R9` = 0 by design.
- **Sources.** [Zeng and others 2019][zeng19].
- **Related.** [HWY-034](#hwy-034), [HWY-005](#hwy-005), [HWY-006](#hwy-006).

### HWY-021 Spectral bundling by effective resistance

Kind: literature. Step: `highway`. Mode: G. Prototype: M. Depends on the placement: no.

- **What it does.** The effective resistance of an edge in the graph tells if other paths join its ends. An edge with a low resistance lies in a dense part, so a bundle with its neighbours hides little. An edge with a high resistance is a bridge and stays alone. The resistance thus scales the compatibility of each pair.
- **Math.** `R(u,v) = (e_u - e_v)^T L^+ (e_u - e_v). Approximate with a few random projections and a Laplacian solver. C'(e,f) = C(e,f) (1 - R_e R_f).`
- **Cost.** `O(m log n / eps^2)` with random projections. 100 nodes: 10 to 30 ms. 1000 nodes: 100 to 400 ms with a simple conjugate gradient.
- **Options.** `projections 8..64`, `resistance weight 0..1`, `sparsify: on or off`.
- **Improves.** `B4`, `B1`. **Risks.** `B2`.
- **Screen.** Boards: `small-clustered`, `case-dense-groups`, `mid-clustered`. Keep if `B4` drops by 20% at a `B1` loss < 10% with any base clusterer.
- **Sources.** [Jiang and others 2026][jiang26], [Spielman and Srivastava 2011][spielman11].
- **Related.** [HWY-012](#hwy-012), [HWY-049](#hwy-049), [HWY-030](#hwy-030).

### HWY-022 Bundled crossings

Kind: literature. Step: `highway`. Mode: B. Prototype: M. Depends on the placement: yes.

- **What it does.** Where a group of parallel edges crosses another group, all the crossings happen in one block. The model is two roads that cross at one bridge. The rule moves the crossings of two highways to one place. The reader thus sees one bundled crossing and not many single ones.
- **Math.** `Partition the crossings into bundled crossings (two bundles crossing as a complete crossbar). Minimum is NP-hard, an O(1) approximation exists for fixed embeddings. Greedy: grow a crossbar while the lanes stay parallel.`
- **Cost.** `O(X log X)` for X crossings, greedy. 100 nodes: < 10 ms. 1000 nodes: 20 to 100 ms.
- **Options.** `parallel tolerance 5..20 deg`, `min crossbar 2x2..4x4`.
- **Improves.** `R1`, `R2`, `B5`. **Risks.** `B3`, `R4`.
- **Screen.** Boards with crossing highways: `case-many-groups`, `mid-uniform`. Measure the count of crossing blocks. Keep if the blocks drop by 30% at an `R5` rise < 3%.
- **Sources.** [Fink and others 2016][fink16], [Alam and others 2016][alam16].
- **Related.** [HWY-016](#hwy-016), [HWY-051](#hwy-051).

## Clustering of edges

These ideas answer one part of the question: which edges belong to one highway. Each one needs a spine rule after it, for example [HWY-043](#hwy-043) or [HWY-050](#hwy-050).

### HWY-023 End point clustering in 4D (flow clustering)

Kind: literature. Step: `highway`. Mode: A. Prototype: S. Depends on the placement: yes.

- **What it does.** Each edge is a 4D point: its source and its target. Two edges are near when both their sources and their targets are near, relative to their length. A hierarchical clustering with this distance gives groups of edges that go from one area to another area. Each group with enough edges is a highway.
- **Math.** `d(e,f) = max(|s_e - s_f|, |t_e - t_f|) / min(len e, len f), and min with the swapped ends for undirected edges. Average linkage, cut at d <= tau.`
- **Cost.** `O(m log m)` with a k-d tree in 4D and a sparse linkage. 100 nodes: < 10 ms. 1000 nodes: 20 to 80 ms.
- **Options.** `tau 0.1..0.6`, `linkage: average, complete, single`, `directed: yes or no`, `minSize 2..16`.
- **Improves.** `B1`, `B2`, `B4`. **Risks.** `B3`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B1` ≥ `trunks` and `B4` ≤ `shared` on 3 of 5 boards.
- **Sources.** [Zhu and Guo 2014][zhu14], [Gansner and others 2011][gansner11].
- **Related.** [HWY-018](#hwy-018), [HWY-026](#hwy-026), [HWY-028](#hwy-028).

### HWY-024 Hough voting for corridors

Kind: hybrid. Step: `highway`. Mode: A. Prototype: S. Depends on the placement: yes.

- **What it does.** Each straight line of an edge votes for its line parameters (angle, offset) in an accumulator, with a weight of its length. Each peak of the votes is a corridor that many edges follow. The edges near a peak join its highway, and the highway runs over the common span of their projections.
- **Math.** `theta = atan2(dy,dx) mod pi, rho = x cos theta + y sin theta. Vote with a Gaussian of widths (d theta, d rho). Peaks by non-maximum suppression. An edge joins a peak if |theta - theta_p| <= d theta and |rho - rho_p| <= d rho.`
- **Cost.** `O(m B)` for B bins of the vote kernel. 100 nodes: < 5 ms. 1000 nodes: 10 to 30 ms.
- **Options.** `d theta 3..20 deg`, `d rho 1..8 u`, `min votes 2..16`, `orthogonal mode: theta in {0, 90}`.
- **Improves.** `B1`, `R14`, `B2`. **Risks.** `B3`, `B4`, `R9`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B1` > 0.8 times `shared` at 1/10 of its time on 3 of 5 boards.
- **Sources.** [Duda and Hart 1972][duda72].
- **Related.** [HWY-058](#hwy-058), [HWY-023](#hwy-023).

### HWY-025 Segment clustering of the first routes (TRACLUS)

Kind: literature. Step: `highway`. Mode: B. Prototype: M. Depends on the placement: yes.

- **What it does.** Each first route breaks into a few long segments by a minimum description length rule. Segments that are near in distance and angle cluster by density. Each dense cluster of segments from enough edges is a highway section, and its representative line is the spine. One edge can join several highways along its way.
- **Math.** `Distance of segments: d = w_perp d_perp + w_par d_par + w_theta d_theta. DBSCAN with eps and minLns. Representative: sweep along the mean direction, average the segments that cover each point.`
- **Cost.** `O(S log S)` with a grid for S segments. 100 nodes: 10 to 30 ms. 1000 nodes: 80 to 250 ms, plus one run of `corners`.
- **Options.** `eps 1..6 u`, `minLns 2..16`, `weights w_perp, w_par, w_theta 0..2`, `MDL cost ratio 0.5..2`.
- **Improves.** `B1`, `B2`, `B8`, `B9`. **Risks.** `B3`, `B6`, `Z10`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B1` ≥ `shared` and `B3` q95 ≤ `shared` on 3 of 5 boards.
- **Sources.** [Lee and others 2007][lee07].
- **Related.** [HWY-031](#hwy-031), [HWY-050](#hwy-050), [HWY-027](#hwy-027).

### HWY-026 QuickBundles: one pass with a distance threshold

Kind: literature. Step: `highway`. Mode: A. Prototype: S. Depends on the placement: yes.

- **What it does.** Each edge (straight line or first route) resamples to K points. In one pass, an edge joins the nearest cluster whose centroid is within a threshold, else it starts a new cluster. The centroid line of each cluster is the highway spine. The pass is online, so an added edge does not change the old clusters.
- **Math.** `MDF(e,f) = min(mean_i |e_i - f_i|, mean_i |e_i - f_{K-1-i}|). Join if MDF <= theta, update the centroid as a running mean.`
- **Cost.** `O(m c K)` for c clusters. 100 nodes: < 5 ms. 1000 nodes: 10 to 50 ms.
- **Options.** `theta 1..10 u`, `K points 6..24`, `input: lines or first routes`, `order: input order or by length`.
- **Improves.** `B1`, `B2`, `Z10`. **Risks.** `B3`, `B4`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B1` ≥ 0.9 times `shared` at 1/5 of its time on 3 of 5 boards. The `Z10` moved share must also be below `shared`.
- **Sources.** [Garyfallidis and others 2012][garyfallidis12].
- **Related.** [HWY-025](#hwy-025), [HWY-009](#hwy-009), [HWY-054](#hwy-054).

### HWY-027 Subtrajectory clustering by Fréchet distance

Kind: literature. Step: `highway`. Mode: B. Prototype: L. Depends on the placement: yes.

- **What it does.** Find each subpath that at least k first routes follow within a Fréchet distance eps. Such a subpath is a highway with k lanes, and its length is as long as possible. The method finds shared parts of routes that start and end in different places.
- **Math.** `Find the longest subpath P of a route with >= k other subroutes within Fréchet distance eps of P. Exact is O(n^3 k) in the worst case. Use the free space diagram with a grid of candidate starts.`
- **Cost.** `O(m^2 p^2)` for p points per route in the worst case. 100 nodes: 0.1 to 0.5 s. 1000 nodes: 10 s or more, so only below 300 nodes.
- **Options.** `eps 1..6 u`, `k min lanes 2..8`, `min length 2..20 u`.
- **Improves.** `B9`, `B1`, `B8`. **Risks.** `B3`.
- **Screen.** Small boards only: the case boards and `small-clustered`. Use it as a reference for TRACLUS and corridor signatures. Keep as a reference if its `B1` is > 1.1 times theirs.
- **Sources.** [Buchin and others 2011][buchin11b].
- **Related.** [HWY-025](#hwy-025), [HWY-031](#hwy-031), [HWY-040](#hwy-040).

### HWY-028 HDBSCAN on edges with a compatibility distance

Kind: hybrid. Step: `highway`. Mode: A. Prototype: M. Depends on the placement: yes.

- **What it does.** The distance between two edges is 1 minus their FDEB compatibility, or the 4D end point distance. HDBSCAN builds the tree of all density levels and keeps the clusters that live over a long range. Noise edges stay alone. The kept clusters are the highways, with no fixed count.
- **Math.** `d(e,f) = 1 - Ca Cs Cp Cv. Mutual reachability d_m = max(core_k(e), core_k(f), d). Minimum spanning tree, condensed tree, stability = sum (lambda_leave - lambda_birth).`
- **Cost.** `O(m log m)` with a k-d tree on 4D, `O(m^2)` with the compatibility. 100 nodes: 10 to 40 ms. 1000 nodes: 0.1 to 2 s.
- **Options.** `min cluster size 2..16`, `min samples k 1..8`, `distance: compatibility or 4D`.
- **Improves.** `B1`, `B4`, `B8`. **Risks.** `B3`, `Z10`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B1` ≥ `shared` and `B4` ≤ `shared` on 3 of 5 boards.
- **Sources.** [Campello and others 2013][campello13], [Holten and van Wijk 2009][holten09].
- **Related.** [HWY-023](#hwy-023), [HWY-002](#hwy-002), [HWY-053](#hwy-053).

### HWY-029 Spectral clustering of the compatibility graph

Kind: hybrid. Step: `highway`. Mode: A. Prototype: M. Depends on the placement: yes.

- **What it does.** A graph has one vertex for each edge of the board, and a weight for each compatible pair. A spectral cut splits this graph into groups with many strong pairs inside them. The eigengap gives the count of highways, so the count is not a guess.
- **Math.** `W_ef = C(e,f) if C >= c0. L_sym = I - D^-1/2 W D^-1/2. k = argmax eigengap. k-means on the first k eigenvectors.`
- **Cost.** `O(nnz(W) k t)` with Lanczos. 100 nodes: 20 to 50 ms. 1000 nodes: 0.3 to 1.5 s.
- **Options.** `c0 0.2..0.8`, `k: eigengap or fixed 2..64`.
- **Improves.** `B1`, `B8`. **Risks.** `B3`, `Z10`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B1` > HDBSCAN on 3 of 5 boards. It is a second choice behind HDBSCAN.
- **Sources.** [von Luxburg 2007][luxburg07], [Holten and van Wijk 2009][holten09].
- **Related.** [HWY-028](#hwy-028), [HWY-021](#hwy-021).

### HWY-030 Link communities on the line graph

Kind: literature. Step: `highway`. Mode: G. Prototype: M. Depends on the placement: no.

- **What it does.** Two edges that share a node are similar when their other ends have similar neighbours. A clustering of the edges with this similarity gives link communities, which can overlap in the nodes. A link community is a set of edges that belong together in the graph, so its highway shows no false link.
- **Math.** `S(e_ik, e_jk) = |N+(i) n N+(j)| / |N+(i) u N+(j)|. Single linkage, cut at the best partition density D = 2/m sum m_c (m_c - n_c + 1) / ((n_c - 2)(n_c - 1)).`
- **Cost.** `O(n k_max^2)` for the pairs. 100 nodes: < 10 ms. 1000 nodes: 20 to 100 ms.
- **Options.** `cut: best density or a fixed share`, `min community 2..16`, `geometry check: max spread 2..10 u`.
- **Improves.** `B4`, `G1`. **Risks.** `B1`, `B3`.
- **Screen.** Boards: `small-clustered`, `mid-clustered`, `case-dense-groups`. Keep if `B4` < 0.6 times `shared` at `B1` ≥ 0.7 times `shared`.
- **Sources.** [Ahn and others 2010][ahn10], [Evans and Lambiotte 2009][evans09].
- **Related.** [HWY-012](#hwy-012), [HWY-013](#hwy-013), [HWY-014](#hwy-014).

### HWY-031 Corridor signatures: overlap of the first routes

Kind: ours. Step: `highway`. Mode: B. Prototype: S. Depends on the placement: yes.

- **What it does.** Route each edge alone first (corners). The signature of a route is its list of corner graph links. Two edges overlap by the length of their common links. Edges whose overlap is long make a cluster, and the common run of their links is the highway. MinHash finds the pairs fast.
- **Math.** `ov(e,f) = sum len(l) over l in links(e) n links(f). Join if ov >= max(L*, rho min(len e, len f)). MinHash with h hashes and b bands finds candidates with Jaccard >= j0. Union-find for the clusters, then the longest common run in order.`
- **Cost.** `O(m h + candidates p)`. 100 nodes: < 10 ms after `corners`. 1000 nodes: 20 to 60 ms after `corners`.
- **Options.** `rho share 0.1..0.8`, `minSize 2..16`, `hashes h 16..128`, `bands b 4..32`, `near links: same link or within 1 lane`.
- **Improves.** `B1`, `B2`, `B3`, `B8`. **Risks.** `B4`, `Z10`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B1` ≥ 0.9 times `shared` at `B3` q95 ≤ 0.95 times `shared` on 3 of 5 boards. This is the first idea to screen.
- **Sources.** [Broder 1997][broder97].
- **Related.** [HWY-025](#hwy-025), [HWY-034](#hwy-034), [HWY-047](#hwy-047), [HWY-050](#hwy-050).

### HWY-032 Ridges of the line density in one pass

Kind: ours. Step: `highway`. Mode: A. Prototype: S. Depends on the placement: yes.

- **What it does.** Draw the density of the straight lines or of the first routes once, with no advection. Find its ridges with the Hessian. A ridge with a high density and a length above a limit is a highway spine. Edges near a ridge snap to it between their nearest entry and exit points.
- **Math.** `Ridge where the larger eigenvalue of the Hessian of rho is negative and the gradient along its eigenvector is zero. Strength = rho times |lambda|. Keep ridges with strength >= s0 and length >= l0.`
- **Cost.** `O(W H)` for one blur and one Hessian. 100 nodes: 5 to 20 ms. 1000 nodes: 30 to 100 ms.
- **Options.** `bandwidth 1..8 u`, `s0 strength`, `l0 min length 2..20 u`, `image size 128..1024`.
- **Improves.** `B1`, `B7`. **Risks.** `R9`, `B3`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B1` ≥ 0.9 times KDEEB at 1/5 of its time on 3 of 5 boards.
- **Sources.** [Lindeberg 1998][lindeberg98], [Hurter and others 2012][hurter12].
- **Related.** [HWY-006](#hwy-006), [HWY-053](#hwy-053).

### HWY-033 Territory aggregation of flows

Kind: literature. Step: `highway`. Mode: B. Prototype: M. Depends on the placement: yes.

- **What it does.** Characteristic points (the plugs, the bends of the first routes) cluster by distance. The cluster centres make Voronoi cells. Each route becomes a list of cell crossings, and the counts give a flow between neighbour cells. Strong flows between cells are the highways, and the cell centres are the interchanges.
- **Math.** `Points -> groups of radius r -> centroids -> Voronoi. flow(c, c') = count of routes that cross from c to c'. Highway segment where flow >= minSize. The radius r sets the scale.`
- **Cost.** `O(P log P)` for P points. 100 nodes: 10 to 20 ms. 1000 nodes: 50 to 150 ms.
- **Options.** `radius r 2..20 u`, `minSize 2..16`, `points: plugs, bends or both`.
- **Improves.** `B1`, `B8`, `Z9`. **Risks.** `B3`, `R9`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Also run it at 3 radii as 3 zoom levels. Keep if `Z9` improves with `B1` ≥ `shared`.
- **Sources.** [Andrienko and Andrienko 2011][andrienko11].
- **Related.** [HWY-052](#hwy-052), [HWY-060](#hwy-060), [HWY-056](#hwy-056).

### HWY-034 Route betweenness on the corner graph (road classes)

Kind: hybrid. Step: `highway`. Mode: B. Prototype: S. Depends on the placement: yes.

- **What it does.** Count how many first routes use each link of the corner graph. Links with a high count form the highway network, as the main roads of a road map. A second routing pass gives these links a discount, so more edges join them. Road classes come from quantiles of the count.
- **Math.** `use(l) = |{e : l in route(e)}|. Highway links H = {l : use(l) >= max(minSize, q_p(use))}. Second pass cost(l) = len(l) (1 - delta [l in H]).`
- **Cost.** Two runs of `corners` plus `O(sum route links)`. 100 nodes: 2 times `corners`. 1000 nodes: 2 times `corners` + 10 ms.
- **Options.** `quantile p 0.8..0.99`, `minSize 2..16`, `discount delta 0.1..0.8`, `classes 1..3`.
- **Improves.** `B1`, `B2`, `B8`, `Z10`. **Risks.** `B3`, `R5`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B1` ≥ `shared` at `B3` q95 ≤ `shared` on 3 of 5 boards, and `Z10` moved share ≤ `shared`.
- **Sources.** [Sanders and Schultes 2005][sanders05], [Brandes 2001][brandes01].
- **Related.** [HWY-005](#hwy-005), [HWY-020](#hwy-020), [HWY-031](#hwy-031), [HWY-044](#hwy-044).

### HWY-035 Consensus of clusterings

Kind: hybrid. Step: `highway`. Mode: A. Prototype: M. Depends on the placement: yes.

- **What it does.** Several clusterers (or one clusterer with several seeds and thresholds) each give highways. A pair of edges gets one vote for each clustering that puts them in one highway. A final clustering of the vote matrix keeps only the pairs that most runs agree on. The result is stable after small edits.
- **Math.** `Co-association A_ef = (1/R) sum_r [c_r(e) = c_r(f)]. Single or average linkage on 1 - A, cut at 0.5.`
- **Cost.** R times the base cost plus `O(pairs)`. 100 nodes: R times base. 1000 nodes: R times base + 20 ms.
- **Options.** `runs R 3..20`, `members: which clusterers`, `cut 0.3..0.8`.
- **Improves.** `Z10`, `B4`. **Risks.** `B1`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `Z10` moved share drops by 30% against the best member at a `B1` loss < 5%.
- **Sources.** [Strehl and Ghosh 2002][strehl02], [Fred and Jain 2005][fred05].
- **Related.** [HWY-054](#hwy-054), [HWY-045](#hwy-045).

## Network design

These ideas give a cost to each shared link and find the network with the least cost. They answer where a highway runs, and the cost answers when it is worth it.

### HWY-036 Obstacle-avoiding rectilinear Steiner tree for a group

Kind: literature. Step: `highway`. Mode: A. Prototype: M. Depends on the placement: yes.

- **What it does.** The plugs of a group of edges (one source and its targets, or a key group) are the terminals. A rectilinear Steiner tree joins them with the least length around the boxes. The tree is the highway network of the group, with the Steiner points as junctions. Diagram editors route hyperedges this way.
- **Math.** `Candidate Steiner points on the Hanan grid of the terminals and the box corners. Iterated 1-Steiner or FLUTE tables for small groups, then a repair around the boxes.`
- **Cost.** `O(k^2 log k)` per group of k terminals with iterated 1-Steiner. 100 nodes: < 20 ms. 1000 nodes: 50 to 200 ms.
- **Options.** `max group 3..32`, `Steiner method: 1-Steiner or FLUTE-like`, `orthogonal or octilinear`.
- **Improves.** `B1`, `R14`, `B2`. **Risks.** `B3`, `R5`, `R7`.
- **Screen.** Boards: `mid-fanout`, `case-hub-chain`. Keep if `B1` > `trunks` by 10% with `R7` = 0 and `B3` q95 < 1.5.
- **Sources.** [Hanan 1966][hanan66], [Chu and Wong 2008][chu08], [Wybrow and others 2012][wybrow12].
- **Related.** [HWY-037](#hwy-037), [HWY-017](#hwy-017), [HWY-058](#hwy-058).

### HWY-037 Steiner arborescence for a fan-out

Kind: literature. Step: `highway`. Mode: A. Prototype: S. Depends on the placement: yes.

- **What it does.** For one source and many targets, build a tree where each target path is a shortest path from the source. The tree shares as much as it can without a detour. Each target thus keeps its direct length, and the shared trunk saves ink. It is the monotone form of the trunk of today.
- **Math.** `Rectilinear Steiner arborescence: greedy merge of the two points p, q whose meet point (min x, min y in the quadrant frame) is farthest from the root. Ratio 2 to the optimum.`
- **Cost.** `O(k log k)` per source. 100 nodes: < 5 ms. 1000 nodes: 10 to 30 ms.
- **Options.** `min targets 2..20`, `quadrant split: 4 or by angle`, `max stretch 1.0..1.3`.
- **Improves.** `B1`, `B3`, `R5`. **Risks.** `R9`, `R8`.
- **Screen.** Boards: `mid-fanout`, `small-clustered`. Keep if `B3` q95 ≤ 1.05 with `B1` ≥ `trunks` on 2 of 2 boards.
- **Sources.** [Rao and others 1992][rao92].
- **Related.** [HWY-017](#hwy-017), [HWY-036](#hwy-036), [HWY-015](#hwy-015).

### HWY-038 Branched transport: cost f^alpha (Gilbert, Xia)

Kind: hybrid. Step: `highway`. Mode: A. Prototype: M. Depends on the placement: yes.

- **What it does.** A link that carries f edges costs f^alpha times its length, with alpha between 0 and 1. A smaller alpha rewards sharing more. The best network has closed-form merge angles and a closed-form rule for when two edges merge. One number, alpha, thus sets when highways form, where they merge and how wide they are.
- **Math.** `Cost = sum_l f_l^alpha len_l. Two equal flows merge at a half angle theta with cos theta = 2^(alpha-1) (alpha 0: 60 deg, 0.5: 45 deg). Two parallel edges at gap d merge if their overlap L > d sqrt((2+t)/(2-t)), t = 2^alpha.`
- **Cost.** Local search over the merge points: `O(m log m)` per pass, 3 to 10 passes. 100 nodes: 10 to 40 ms. 1000 nodes: 0.1 to 0.5 s.
- **Options.** `alpha 0..1 (default 0.6)`, `passes 1..10`, `width rule: f^beta, beta 0.33..1`.
- **Improves.** `B1`, `B6`, `B8`. **Risks.** `B3`, `B4`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Sweep alpha in 0.2 steps. Keep if its (`B1`, `B3`) front dominates the discount sweep of `shared` on 3 of 5 boards.
- **Sources.** [Gilbert 1967][gilbert67], [Xia 2003][xia03], [Bernot and others 2009][bernot09].
- **Related.** [HWY-039](#hwy-039), [HWY-047](#hwy-047), [HWY-043](#hwy-043), [HWY-051](#hwy-051).

### HWY-039 Buy-at-bulk with concave link costs and rip-up

Kind: literature. Step: `router`. Mode: C. Prototype: S. Depends on the placement: yes.

- **What it does.** Each edge routes on the marginal cost of a concave function of the load of each link. The order of the edges changes the result. Thus a second phase rips up each edge and routes it again on the loads of all the others. The router shared is the first pass with one fixed discount.
- **Math.** `Marginal cost of link l for one more edge: len_l (g(f_l + 1) - g(f_l)), g concave (f^alpha, log(1+f), or 1 + delta (f - 1)). Rip-up passes until no change or P passes.`
- **Cost.** `O(P m L log L)`. 100 nodes: 3 times `shared`. 1000 nodes: 3 to 5 times `shared`.
- **Options.** `g: power, log, fixed charge`, `alpha 0.2..0.9`, `passes P 1..5`, `order: length, random seed`.
- **Improves.** `B1`, `B8`, `Z10`. **Risks.** `B3`, `R5`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if the rip-up passes raise `B1` by 5% over `shared` at equal `B3` q95 on 3 of 5 boards.
- **Sources.** [Awerbuch and Azar 1997][awerbuch97], [Meyerson and others 2000][meyerson00], [Zangwill 1968][zangwill68].
- **Related.** [HWY-038](#hwy-038), [HWY-005](#hwy-005), [HWY-044](#hwy-044), [HWY-016](#hwy-016).

### HWY-040 Fixed-charge network design, exact on small boards

Kind: literature. Step: `highway`. Mode: C. Prototype: L. Depends on the placement: yes.

- **What it does.** A mixed integer program opens links of the corner graph for a fixed charge and routes each edge on the open links. The optimum is the least ink for a given stretch limit. It is too slow for real boards. But it gives the best answer on small boards, so the bench can show the gap of each heuristic.
- **Math.** `min sum_l F_l y_l + sum_{e,l} c_l x_el, flow conservation for each edge, x_el <= y_l, len(path e) <= s len*(e). Branch and bound, or a Lagrangean bound.`
- **Cost.** Exponential. Boards of 10 to 20 nodes: 1 to 60 s in CI. No run at 100 nodes.
- **Options.** `fixed charge F 0..1 x len`, `stretch limit s 1.1..2`, `time limit`.
- **Improves.** `B1`. **Risks.** none.
- **Screen.** MEAS2 boards of 10 to 20 nodes. Keep as the reference if it solves 10 boards in CI within 10 min. It does not enter the build of strategies.
- **Sources.** [Magnanti and Wong 1984][magnanti84].
- **Related.** [HWY-038](#hwy-038), [HWY-045](#hwy-045), [HWY-027](#hwy-027).

### HWY-041 Hub location (p-hub median)

Kind: literature. Step: `highway`. Mode: A. Prototype: M. Depends on the placement: yes.

- **What it does.** Choose p hubs among candidate points of the free space. Each edge goes from its source to a hub, maybe to a second hub, and to its target. A link between two hubs costs alpha times its length, so many edges share it. The hub links are the highways.
- **Math.** `min sum_e min_{h,k} (d(s,h) + alpha d(h,k) + d(k,t)). Single allocation: each node to one hub. Heuristic: p-median of the plugs for the hubs, then assignment, then swap hubs.`
- **Cost.** `O(m p^2)` for the assignment, times the swaps. 100 nodes: 10 to 50 ms. 1000 nodes: 0.2 to 1 s.
- **Options.** `p hubs 2..sqrt(n)`, `alpha 0.2..0.8`, `allocation: single or multiple`, `candidates: corners or section centres`.
- **Improves.** `B1`, `B8`, `Z9`. **Risks.** `B3`, `R7`, `R5`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B1` > `sections` at a lower `R7` and `B3` q95 on 3 of 5 boards.
- **Sources.** [O'Kelly 1987][okelly87], [Campbell 1994][campbell94].
- **Related.** [HWY-042](#hwy-042), [HWY-001](#hwy-001), [HWY-060](#hwy-060).

### HWY-042 Hub arc location: choose q highways

Kind: literature. Step: `highway`. Mode: A. Prototype: M. Depends on the placement: yes.

- **What it does.** Instead of hubs, choose q discounted arcs directly. An edge can use at most one arc (or a path of arcs) with the discount alpha, and the rest of its way at full cost. The q chosen arcs are the highways. The model answers the exact question of this note: which few shared ways serve the most edges.
- **Math.** `min sum_e min(d(s,t), min_{arc (h,k) in Q} d(s,h) + alpha d(h,k) + d(k,t)), |Q| = q. Greedy: add the arc with the largest saving, then swap arcs.`
- **Cost.** `O(q A m)` for A candidate arcs. 100 nodes: 20 to 80 ms. 1000 nodes: 0.5 to 2 s with candidate arcs from the corridor signatures.
- **Options.** `q arcs 1..64, or until the saving < s0`, `alpha 0.2..0.8`, `candidate arcs: corner links, corridor runs`.
- **Improves.** `B1`, `B8`, `B3`. **Risks.** `B4`, `R7`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if the greedy q curve reaches 80% of its `B1` with q < 10 highways on 3 of 5 boards.
- **Sources.** [Campbell and others 2005][campbell05].
- **Related.** [HWY-041](#hwy-041), [HWY-045](#hwy-045), [HWY-031](#hwy-031).

### HWY-043 Meeting points by Weiszfeld with a weighted trunk

Kind: hybrid. Step: `highway`. Mode: A. Prototype: S. Depends on the placement: yes.

- **What it does.** Find the merge point M1 near the sources of a group and the split point M2 near its targets. Together they give the least weighted ink. The trunk M1 to M2 has the weight of its load. Weiszfeld iterations solve it fast. Any clusterer of this note can use it to place the ends of a highway.
- **Math.** `min_{M1,M2} sum_i |s_i - M1| + w |M1 - M2| + sum_i |M2 - t_i|, w = k^alpha. Alternate Weiszfeld steps: M1 = (sum s_i/|s_i - M1| + w M2/|M1 - M2|) / (sum 1/|s_i - M1| + w/|M1 - M2|).`
- **Cost.** `O(k I)` per group, I = 10 to 30. 100 nodes: < 2 ms. 1000 nodes: < 10 ms.
- **Options.** `alpha 0..1`, `steps 10..50`, `box push: move M out of a box`.
- **Improves.** `B1`, `B6`. **Risks.** `R9`, `B3`.
- **Screen.** Use the groups of HWY-023 on 3 boards. Keep if `B1` rises by 3% over the split rule of `trunks` (split 0.5) at equal `B3`.
- **Sources.** [Beck and Sabach 2015][beck15], [Gansner and others 2011][gansner11].
- **Related.** [HWY-003](#hwy-003), [HWY-038](#hwy-038), [HWY-050](#hwy-050).

### HWY-044 Negotiated attraction (PathFinder turned around)

Kind: ours. Step: `router`. Mode: C. Prototype: M. Depends on the placement: yes.

- **What it does.** PathFinder in chip routing raises the cost of busy links until the routes spread. Here the history term lowers the cost of links that many edges used in earlier passes. A capacity term stops a highway from growing past its width. The passes converge to a few strong highways that fit their gaps.
- **Math.** `cost_k(l) = len(l) (1 - a h_k(l)) (1 + b max(0, use_k(l) - cap(l))). h_{k+1}(l) = h_k(l) + use_k(l)/m, capped at 0.9/a.`
- **Cost.** `O(K m L log L)`. 100 nodes: 3 to 5 times `shared`. 1000 nodes: 3 to 6 times `shared`.
- **Options.** `passes K 2..10`, `attraction a 0..1`, `capacity weight b 0..10`, `capacity from the gap width`.
- **Improves.** `B1`, `B8`, `M4`. **Risks.** `B3`, `R5`, `Z10`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B1` > `shared` by 5% with `M4` ≤ `shared` on 3 of 5 boards.
- **Sources.** [McMurchie and Ebeling 1995][mcmurchie95].
- **Related.** [HWY-039](#hwy-039), [HWY-005](#hwy-005), [HWY-034](#hwy-034), [HWY-016](#hwy-016).

### HWY-045 Candidate generation and selection

Kind: ours. Step: `highway`. Mode: B. Prototype: M. Depends on the placement: yes.

- **What it does.** Several generators (clusterers, Steiner trees, hub arcs) each propose candidate highways. Each candidate has a gain (ink saved) and a cost (stretch, ambiguity, width). A selection picks the set of candidates with the largest net gain, where each edge rides at most one highway at each place. This splits where a highway runs from the choice to make it.
- **Math.** `max sum_h x_h (gain_h - lambda_3 stretch_h - lambda_4 amb_h), x_h in {0,1}, conflicts: x_h + x_h' <= 1 when they claim one edge on one stretch. Greedy by net gain per edge, then 1-swap local search.`
- **Cost.** `O(H log H + conflicts)` for H candidates. 100 nodes: < 10 ms. 1000 nodes: 20 to 100 ms, plus the generators.
- **Options.** `generators: list`, `weights lambda_3, lambda_4 0..4`, `swap passes 0..5`.
- **Improves.** `B1`, `B3`, `B4`. **Risks.** `Z10`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if the selection over 3 generators dominates each generator alone on (`B1`, `B3`, `B4`) on 3 of 5 boards.
- **Sources.** [Chvátal 1979][chvatal79].
- **Related.** [HWY-042](#hwy-042), [HWY-059](#hwy-059), [HWY-035](#hwy-035).

## Dynamic rules

These ideas are rules over the other ideas. They decide when a highway forms, where it starts and ends, how wide it is and how it changes with the zoom and with edits.

### HWY-046 Count threshold with hysteresis

Kind: ours. Step: `highway`. Mode: any. Prototype: S. Depends on the placement: no.

- **What it does.** A highway forms when k_on edges share a corridor and dissolves only when fewer than k_off remain, with k_off < k_on. An edit that adds or removes one edge near the threshold thus does not make a highway flicker. Today the rule is one number, minSize 2.
- **Math.** `state(h) = on if n_h >= k_on, off if n_h < k_off, else the state of the previous result.`
- **Cost.** `O(H)`. No measurable time.
- **Options.** `k_on 2..16`, `k_off 1..k_on`.
- **Improves.** `Z10`, `B8`. **Risks.** `B1`.
- **Screen.** Use the seeded edits of `Z10` on the 5 screen boards. Keep if `Z10` moved share drops by 20% at a `B1` loss < 3%.
- **Sources.** [Hurter and others 2013][hurter13].
- **Related.** [HWY-054](#hwy-054), [HWY-047](#hwy-047).

### HWY-047 Break-even overlap law

Kind: ours. Step: `highway`. Mode: A. Prototype: S. Depends on the placement: yes.

- **What it does.** Two edges at gap d merge only if their common stretch is longer than d sqrt((2+t)/(2-t)). Here t is the drawn cost of a shared stretch. With t = 1 (B1 ink, one line) the limit is sqrt(3) d. A short or wide overlap thus does not make a highway that adds ink.
- **Math.** `Ink of the merged pair = t L + d sqrt(4 - t^2) with the optimal merge legs. Merge if 2L > that, so L* = d sqrt((2+t)/(2-t)). Merge leg half angle theta: cos theta = t/2.`
- **Cost.** `O(1)` per candidate pair.
- **Options.** `t 1..1.9 (or alpha 0..0.93)`, `d: lane gap or the gap of the straight lines`.
- **Improves.** `B1`, `B6`, `B3`. **Risks.** `B2`.
- **Screen.** Apply it as a filter to corridor signatures and QuickBundles. Keep if `B1` does not drop and `B3` q95 drops on 3 of 5 boards.
- **Sources.** [Gilbert 1967][gilbert67], [Xia 2003][xia03].
- **Related.** [HWY-038](#hwy-038), [HWY-031](#hwy-031), [HWY-026](#hwy-026).

### HWY-048 Stretch budget for each edge (join test)

Kind: ours. Step: `highway`. Mode: B. Prototype: S. Depends on the placement: yes.

- **What it does.** An edge joins a highway only if its route on the highway is at most s times its own first route, plus a pad. An edge that fails stays alone, and the highway does not bend for it. The router sections has this limit for hubs today, and this rule makes it general.
- **Math.** `join(e,h) iff len(ramp_in) + len(spine part) + len(ramp_out) <= s len(first(e)) + pad.`
- **Cost.** `O(1)` per test with the spine length table.
- **Options.** `s 1.0..2.0`, `pad 0..4 margins`.
- **Improves.** `B3`, `R5`, `R6`, `R7`. **Risks.** `B1`, `B2`.
- **Screen.** Apply it to 3 generators on the 5 screen boards. Keep if `R6` drops by 20% at a `B1` loss < 5%.
- **Related.** [HWY-045](#hwy-045), [HWY-047](#hwy-047).

### HWY-049 Ambiguity guard

Kind: ours. Step: `highway`. Mode: G. Prototype: S. Depends on the placement: no.

- **What it does.** A merge of two groups adds false neighbours: pairs of nodes whose routes share a way with no edge between them. The guard counts them before the merge and refuses a merge that adds more than a share of false pairs. Highways then join edges that belong together.
- **Math.** `amb(A u B) = false pairs / all pairs of the ends of A u B. Refuse if amb(A u B) - max(amb A, amb B) > a0, or if the ends of A and B share no node and no group.`
- **Cost.** `O(|A| |B|)` per merge test, sampled above 64 times 64.
- **Options.** `a0 0..0.5`, `group test: same section pair on or off`.
- **Improves.** `B4`. **Risks.** `B1`, `B2`.
- **Screen.** Apply it to MINGLE and corridor signatures. Keep if `B4` drops by 30% at a `B1` loss < 10% on 3 of 5 boards.
- **Sources.** [Wallinger and others 2022][wallinger22].
- **Related.** [HWY-012](#hwy-012), [HWY-021](#hwy-021), [HWY-030](#hwy-030).

### HWY-050 Merge and split points where the routes meet and part

Kind: ours. Step: `highway`. Mode: B. Prototype: S. Depends on the placement: yes.

- **What it does.** For each edge of a highway, the on-ramp is the first point where its first route comes within one lane of the spine. The off-ramp is the last such point. Merges thus happen late and splits early, where the routes really meet. The option leave: part of the router trunks does the same for one trunk.
- **Math.** `on(e) = min{s : dist(first(e)(s), spine) <= w}, off(e) = max{s : ...}. Clamp so that on < off and the ramp turn <= theta_max.`
- **Cost.** `O(p log p)` per edge with a grid on the spine. 100 nodes: < 5 ms. 1000 nodes: < 30 ms.
- **Options.** `w 0.5..2 lanes`, `theta_max 20..60 deg`, `rule: meet, Steiner angle, fixed share`.
- **Improves.** `B3`, `B6`, `R4`. **Risks.** `B1`.
- **Screen.** Use the clusters of corridor signatures on 3 boards. Keep if `B6` and `B3` q95 drop at a `B1` loss < 3%.
- **Related.** [HWY-031](#hwy-031), [HWY-043](#hwy-043), [HWY-009](#hwy-009).

### HWY-051 Width, lanes and capacity: split a highway that does not fit

Kind: ours. Step: `highway`. Mode: B. Prototype: S. Depends on the placement: yes.

- **What it does.** The width of a highway is its lanes times the lane gap, capped by maxWidth. Where a gap between boxes is narrower than the width, the highway splits into two parallel highways in two gaps. Or it asks the room step for space. A width rule f^beta gives a calmer far view, with beta near 1/3 as in Murray's law.
- **Math.** `W = min(maxWidth, n w) for lanes, or W = w0 n^beta for one fat line. If W > gap(l) on a link l: split the lanes into two sets by lane order, or add demand W - gap(l) to the room step.`
- **Cost.** `O(links of the spine)` per highway.
- **Options.** `lane gap w 2..8`, `maxWidth 8..64`, `beta 0.33..1`, `on narrow gap: split, room or squeeze`.
- **Improves.** `M4`, `R8`, `B9`. **Risks.** `B1`, `M1`.
- **Screen.** Boards: `packedGridBoard`, `case-dense-groups`. Keep if `M4` reaches 0 at an `M1` rise < 10% or a `B1` loss < 10%.
- **Sources.** [Murray 1926][murray26].
- **Related.** [HWY-016](#hwy-016), [HWY-057](#hwy-057), [HWY-011](#hwy-011).

### HWY-052 Highways for each zoom level that nest

Kind: ours. Step: `levels`. Mode: any. Prototype: M. Depends on the placement: yes.

- **What it does.** Each zoom level gets its own set of highways from the same rule with a coarser scale. A highway of a fine level must lie inside one highway of the coarser level. Thus zooming in only splits highways and does not move them. Far levels show few wide highways. Close levels show many narrow ones.
- **Math.** `Scale sigma_d = sigma_0 r^d. H_d = rule(edges, sigma_d) restricted to the edges of each h in H_{d-1}. Nesting check: each h in H_d has its edges inside one h' in H_{d-1}.`
- **Cost.** Depth times the rule cost, with the edges split. 100 nodes: 2 to 3 times the rule. 1000 nodes: 2 to 4 times the rule.
- **Options.** `levels 2..6`, `scale ratio r 1.5..4`, `rule: any clusterer with a scale`.
- **Improves.** `Z7`, `Z8`, `Z9`, `Z4`. **Risks.** `B1`.
- **Screen.** Boards: `nestedGridBoard`, `mid-clustered`. Keep if `Z9` drops by 20% with 0 nesting violations.
- **Sources.** [Nachmanson and others 2015][nachmanson15].
- **Related.** [HWY-053](#hwy-053), [HWY-056](#hwy-056), [HWY-001](#hwy-001).

### HWY-053 Scale space with persistence

Kind: hybrid. Step: `levels`. Mode: A. Prototype: M. Depends on the placement: yes.

- **What it does.** Run a density or clustering rule at many scales. Track each highway from the scale where it is born to the scale where it merges into a larger one. Long-lived highways are real, short-lived ones are noise. The zoom levels take the highways that live at their scale, so a zoom shows only stable structure.
- **Math.** `persistence(h) = log(sigma_death / sigma_birth). Keep h at level d if sigma_d in [sigma_birth, sigma_death) and persistence(h) >= p0.`
- **Cost.** S scales times the rule. 100 nodes: 50 to 200 ms. 1000 nodes: 0.5 to 2 s.
- **Options.** `scales S 4..16`, `p0 0.3..2`, `rule: KDEEB, ridges, HDBSCAN`.
- **Improves.** `Z10`, `Z9`, `B8`. **Risks.** `B1`.
- **Screen.** Boards: `mid-clustered`, `small-clustered`. Keep if `Z10` moved share drops by 20% against one scale.
- **Sources.** [Edelsbrunner and others 2002][edelsbrunner02], [Lindeberg 1998][lindeberg98].
- **Related.** [HWY-052](#hwy-052), [HWY-032](#hwy-032), [HWY-028](#hwy-028).

### HWY-054 Stable highway ids across edits

Kind: hybrid. Step: `highway`. Mode: any. Prototype: S. Depends on the placement: no.

- **What it does.** After an edit, the rule starts from the previous highways (warm start). Each new highway gets the id of the old highway with the most common edges. A renderer can then animate a highway as one object. Unmatched highways are new, and their old ones end.
- **Math.** `Match by max sum J(h, h') with the Hungarian method, J = Jaccard of the edge sets, keep matches with J >= 0.5. Warm start: seed the clusterer with the old centroids.`
- **Cost.** `O(H^3)` Hungarian, or greedy `O(H log H)`. 1000 nodes: < 10 ms greedy.
- **Options.** `min Jaccard 0.3..0.8`, `warm start on or off`.
- **Improves.** `Z10`. **Risks.** `B1`.
- **Screen.** The seeded edits of `Z10` on the 5 screen boards. Keep if `Z10` mean and moved share drop by 20%.
- **Sources.** [Hurter and others 2013][hurter13], [Kuhn 1955][kuhn55].
- **Related.** [HWY-046](#hwy-046), [HWY-026](#hwy-026), [HWY-035](#hwy-035).

### HWY-055 Local growth by accretion and extension

Kind: ours. Step: `highway`. Mode: B. Prototype: S. Depends on the placement: yes.

- **What it does.** Start with the longest edge as a seed highway. Each next edge, from long to short, joins the highway that gives it the largest saving, if the saving beats its own route. A highway extends at an end while enough lanes go on together. The growth is local, fast and online.
- **Math.** `save(e,h) = len(first e) - (ramp_in + t spine part + ramp_out). Join argmax_h save if > 0, else e is a new seed. Extend an end while >= k lanes stay within w of each other.`
- **Cost.** `O(m H)` with a grid on the spines. 100 nodes: < 10 ms. 1000 nodes: 30 to 100 ms.
- **Options.** `order: length or input`, `t shared cost 1..1.9`, `extension lanes k 2..8`.
- **Improves.** `B1`, `B2`, `Z10`. **Risks.** `B3`, `B4`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B1` ≥ 0.9 times `shared` at 1/3 of its time on 3 of 5 boards.
- **Related.** [HWY-026](#hwy-026), [HWY-045](#hwy-045), [HWY-047](#hwy-047).

### HWY-056 Level links become highways

Kind: ours. Step: `highway`. Mode: G. Prototype: S. Depends on the placement: yes.

- **What it does.** At the far view, a level link stands for the edges between two items. At the close view, those same edges ride one highway along the path of that level link. The highway set is thus the level links, and a zoom shows the same lines that open into lanes.
- **Math.** `For each level link (A, B, count) with count >= minSize: highway spine = link points outside A and B, edges = the edges from A to B. Ramps through the corner graph inside A and B.`
- **Cost.** `O(m)` after the levels. 100 nodes: < 5 ms. 1000 nodes: < 20 ms.
- **Options.** `depth of the level 1..3`, `minSize 2..16`, `stretch limit s 1.2..2`.
- **Improves.** `Z9`, `B1`, `B8`. **Risks.** `B3`, `R7`.
- **Screen.** Boards: `case-many-groups`, `nestedGridBoard`, `mid-clustered`. Keep if `Z9` drops by 50% with `R7` ≤ `sections`.
- **Related.** [HWY-001](#hwy-001), [HWY-052](#hwy-052), [HWY-018](#hwy-018).

### HWY-057 Gap highways

Kind: ours. Step: `highway`. Mode: B. Prototype: M. Depends on the placement: yes.

- **What it does.** The room step knows the gaps between boxes and the demand of each gap. A gap with demand of k or more lanes holds one highway along its middle line. The highways of neighbour gaps join at the crossings of the gaps. The highway network is thus the street plan of the board.
- **Math.** `Gap graph: nodes = gap crossings, links = gap middle lines. Demand from the first routes. Highway link if demand >= k. Edges route on the gap graph with the highway discount.`
- **Cost.** `O(gaps + m log gaps)`. 100 nodes: < 10 ms. 1000 nodes: 30 to 80 ms.
- **Options.** `k 2..16`, `discount 0.1..0.8`, `gap source: room step or the corner graph`.
- **Improves.** `R14`, `M4`, `B1`. **Risks.** `B3`, `R5`.
- **Screen.** Boards: `packedGridBoard`, `grid-400`, `nestedGridBoard`. Keep if `B1` ≥ `shared` and `M4` = 0 on 2 of 3 boards.
- **Related.** [HWY-016](#hwy-016), [HWY-051](#hwy-051), [HWY-058](#hwy-058).

### HWY-058 Orthogonal streets by set cover

Kind: ours. Step: `highway`. Mode: A. Prototype: M. Depends on the placement: yes.

- **What it does.** For an orthogonal style, candidate streets are horizontal and vertical lines in the gaps. Each street covers the edges whose legs can run on it with a small detour. A greedy set cover picks the few streets that cover the most edges. Edges then route with legs on the streets.
- **Math.** `Candidates: gap lines y = c, x = c. cover(street) = {e : detour of e via street <= s}. Greedy: pick the street with the largest new cover per unit length, until the gain < g0.`
- **Cost.** `O(C m)` for C candidates. 100 nodes: < 20 ms. 1000 nodes: 0.1 to 0.3 s.
- **Options.** `detour limit s 1.0..1.5`, `g0 min gain`, `max streets 4..64`.
- **Improves.** `R14`, `B1`, `R3`. **Risks.** `B3`, `R5`.
- **Screen.** Boards: `grid-400`, `packedGridBoard`. Keep if `R14` > 0.9 and `B1` ≥ `shared` at `B3` q95 ≤ 1.3.
- **Sources.** [Chvátal 1979][chvatal79], [Nöllenburg and Wolff 2011][nollenburg11].
- **Related.** [HWY-024](#hwy-024), [HWY-057](#hwy-057), [HWY-036](#hwy-036).

### HWY-059 Local search over the highway set on the measures

Kind: ours. Step: `highway`. Mode: B. Prototype: M. Depends on the placement: yes.

- **What it does.** Start from any highway set. Moves add a candidate, drop a highway, move one edge to another highway, or move a merge point. Each move is kept if a weighted sum of the measures improves, or by an annealing rule. The search tunes the result on the measures of MEAS0 directly.
- **Math.** `Score = w1 B1 - w3 B3_q95 - w4 B4 - w6 B6. Accept if delta > 0 or with probability exp(delta / T). T falls by 0.95 per sweep.`
- **Cost.** Sweeps times moves times the delta cost. 100 nodes: 0.1 to 0.5 s. 1000 nodes: 2 to 10 s, so CI only.
- **Options.** `weights w 0..4`, `sweeps 5..50`, `start T`, `moves: add, drop, move edge, move point`.
- **Improves.** `B1`, `B3`, `B4`, `B6`. **Risks.** `Z10`.
- **Screen.** Boards: the 3 case boards. Keep if it gains 5% on the score over its start set. It also gives an upper bound for the fast rules.
- **Sources.** [Kirkpatrick and others 1983][kirkpatrick83].
- **Related.** [HWY-045](#hwy-045), [HWY-040](#hwy-040).

### HWY-060 Interchanges: a network of highways

Kind: ours. Step: `highway`. Mode: B. Prototype: L. Depends on the placement: yes.

- **What it does.** Highways do not stay alone: they meet at interchanges, where edges change from one highway to another. An edge can ride two or three highways in a row. The interchanges sit where several highways come near, and a budget limits their count. The highways thus make a small road graph of the board.
- **Math.** `Interchange candidates: points where >= 2 spines come within w. Each edge takes the cheapest path over the highway graph with a change cost c. Keep interchanges with >= k changes.`
- **Cost.** `O(H^2 + m H log H)`. 100 nodes: < 20 ms. 1000 nodes: 0.1 to 0.4 s.
- **Options.** `change cost c 0..8 u`, `interchange budget 1..32`, `max highways per edge 1..3`.
- **Improves.** `B1`, `B8`, `Z9`. **Risks.** `B3`, `B4`, `B5`.
- **Screen.** Screen boards: `case-dense-groups`, `case-hub-chain`, `case-many-groups`, `small-clustered` (5 seeds) and `mid-fanout` (1 seed). Baselines: `corners`, `shared`, `trunks`. Keep if `B1` > the best single-highway rule by 5% at `B3` q95 within 5% on 3 of 5 boards.
- **Sources.** [Andrienko and Andrienko 2011][andrienko11].
- **Related.** [HWY-041](#hwy-041), [HWY-033](#hwy-033), [HWY-042](#hwy-042).

## The standard screen

Each screen of this note uses the same frame. BUILD-W runs it in CI, through the records of the item SCREEN.

- **Boards.** `case-dense-groups`, `case-hub-chain` and `case-many-groups` with one seed. `small-clustered` with 5 seeds. `mid-fanout` with one seed. A screen names other boards when the idea needs them.
- **Baselines.** The routers `corners`, `shared` and `trunks` on the same boards.
- **Measures.** `B1`, `B3` (the 95th percentile), `B4`, `B6`, `B8`, `R1`, `R5` and `Z10`, and the time in CI only.
- **Hard rules.** A result with a rule violation fails, whatever its measures.
- **Default rule to keep.** No rule violation, and the result is not dominated by `shared` or `trunks` on (`B1`, `B3`, `B4`) on 3 of 5 boards. A screen can set a stricter rule.

Most ideas of mode A or B need a step `follow` before the measures can see them. Until HWY-STEP ships, a screen can run on a test router that wraps the idea and `follow`.

## The ranking and the build order

The ranking weighs the expected value against the cost of a prototype. The value is high when an idea answers the question directly, works at 1000 nodes and has a cheap screen.

| Tier | Meaning | Ideas |
|---|---|---|
| 1 | High value, small cost. Build these first. | [HWY-031](#hwy-031), [HWY-050](#hwy-050), [HWY-046](#hwy-046), [HWY-047](#hwy-047), [HWY-048](#hwy-048), [HWY-049](#hwy-049), [HWY-026](#hwy-026), [HWY-034](#hwy-034), [HWY-043](#hwy-043), [HWY-054](#hwy-054), [HWY-015](#hwy-015), [HWY-037](#hwy-037) |
| 2 | High value with a medium cost, or medium value with a small cost | [HWY-018](#hwy-018), [HWY-045](#hwy-045), [HWY-003](#hwy-003), [HWY-017](#hwy-017), [HWY-056](#hwy-056), [HWY-052](#hwy-052), [HWY-038](#hwy-038), [HWY-039](#hwy-039), [HWY-023](#hwy-023), [HWY-025](#hwy-025), [HWY-020](#hwy-020), [HWY-005](#hwy-005), [HWY-016](#hwy-016), [HWY-051](#hwy-051), [HWY-055](#hwy-055), [HWY-012](#hwy-012), [HWY-019](#hwy-019), [HWY-011](#hwy-011), [HWY-024](#hwy-024), [HWY-032](#hwy-032), [HWY-028](#hwy-028), [HWY-042](#hwy-042) |
| 3 | A reference, a renderer option, a slow method or a narrow use | [HWY-001](#hwy-001), [HWY-002](#hwy-002), [HWY-004](#hwy-004), [HWY-006](#hwy-006), [HWY-007](#hwy-007), [HWY-008](#hwy-008), [HWY-009](#hwy-009), [HWY-010](#hwy-010), [HWY-013](#hwy-013), [HWY-014](#hwy-014), [HWY-021](#hwy-021), [HWY-022](#hwy-022), [HWY-027](#hwy-027), [HWY-029](#hwy-029), [HWY-030](#hwy-030), [HWY-033](#hwy-033), [HWY-035](#hwy-035), [HWY-036](#hwy-036), [HWY-040](#hwy-040), [HWY-041](#hwy-041), [HWY-044](#hwy-044), [HWY-053](#hwy-053), [HWY-057](#hwy-057), [HWY-058](#hwy-058), [HWY-059](#hwy-059), [HWY-060](#hwy-060) |

### The build order

| Step | Ideas | Why at this place |
|---|---|---|
| 1 | [HWY-031](#hwy-031) corridor signatures | The direct form of clusters of edges that overlap. It needs only `corners` and a hash, and it gives the first candidates. |
| 2 | [HWY-050](#hwy-050) merge and split points | Each later generator needs ramps. This rule gives them from the first routes. |
| 3 | [HWY-047](#hwy-047) and [HWY-046](#hwy-046) thresholds | The break-even law and the hysteresis make the "when" rule. Each is one line of code. |
| 4 | [HWY-048](#hwy-048) and [HWY-049](#hwy-049) guards | The stretch budget and the ambiguity guard protect `B3` and `B4` for each later generator. |
| 5 | [HWY-026](#hwy-026) QuickBundles | The fastest clusterer. It runs in mode A, so it gives a second generator with no first routes. |
| 6 | [HWY-018](#hwy-018) WSPD | Clusters with a proof of compatibility. It is a strong baseline for the end point view. |
| 7 | [HWY-034](#hwy-034) route betweenness | Road classes from the use of each link. It also gives a link cost to the routers. |
| 8 | [HWY-045](#hwy-045) candidate and select | It joins the generators of steps 1, 5, 6 and 7, and it picks the best set. |
| 9 | [HWY-003](#hwy-003) MINGLE and [HWY-043](#hwy-043) meeting points | The ink rule of the literature, with the best merge and split points of each group. |
| 10 | [HWY-037](#hwy-037) and [HWY-017](#hwy-017) fan trees | A fan-out tree against `trunks` on `mid-fanout`. |
| 11 | [HWY-056](#hwy-056) level links | The far view and the close view show the same highways. |
| 12 | [HWY-052](#hwy-052) and [HWY-054](#hwy-054) zoom and stability | Highways that nest for each level, and ids that stay after an edit. |
| 13 | [HWY-038](#hwy-038) and [HWY-039](#hwy-039) the cost `f^α` | One number for the when, the where and the angle, with passes that route each edge again. |
| 14 | [HWY-040](#hwy-040) exact on small boards | The reference that shows the gap of each heuristic. |

### The five cheapest screens

1. [HWY-046](#hwy-046) count threshold with hysteresis: one rule, the seeded edits of `Z10`.
2. [HWY-047](#hwy-047) break-even overlap law: one filter, `B1` and `B3` on the screen boards.
3. [HWY-048](#hwy-048) stretch budget: one test for each edge, `R6` and `B1`.
4. [HWY-031](#hwy-031) corridor signatures: a hash of the links of `corners`, `B1` and `B3`.
5. [HWY-034](#hwy-034) route betweenness: a count of the links of `corners`, then a second run.

## Combinations with other families

The other research notes of the idea program cover nature, render rules, other fields and our own ideation. These pairs look promising:

- **Trails of ants and slime molds.** A trail that grows with its use is the same loop as [HWY-044](#hwy-044) and [HWY-034](#hwy-034). The decay of a trail adds a forget term to them.
- **Murray's law and leaf veins.** The width rule `f^β` with `β ≈ 1/3` of [HWY-051](#hwy-051) comes from Murray's law. Leaf veins add loops, so a network of highways can keep a second way.
- **Forces and energy.** The force models of the render rules fit [HWY-002](#hwy-002) and [HWY-006](#hwy-006). An energy over the measures is the score of [HWY-059](#hwy-059).
- **Chip routing.** PathFinder turned around is [HWY-044](#hwy-044). Steiner trees and FLUTE are [HWY-036](#hwy-036). The cells of global routing match the gaps of [HWY-057](#hwy-057) and the mesh of [HWY-004](#hwy-004).
- **Metro maps.** The ordered lanes of [HWY-016](#hwy-016) and the streets of [HWY-058](#hwy-058) take the line order and the octilinear rules of metro maps.
- **Room for highways.** [HWY-051](#hwy-051) and [HWY-057](#hwy-057) ask the room step for space. They join the room ideas of the other notes.

The records give the related ideas of this family only. BUILD-W adds the links to the other families when their ids are fixed.

## Gaps

- No measure of MEAS0 ties the count of highways to the zoom. A measure of the highways that change between two levels completes `Z9` and `Z10`.
- The step `follow` does not exist. Most ideas of mode A and B need it before a screen can measure them.
- The DOI of the paper of [Zhu and Guo 2014][zhu14] is not confirmed. The link goes to an index page.
- Few papers measure bundles around boxes. Most methods of the literature draw nodes as points, so their numbers do not carry over.

## Sources

<!-- ste-disable -- the titles of the sources are quotes -->

- <a id="ahn10"></a>Ahn, Bagrow, Lehmann, 2010. [Link communities reveal multiscale complexity in networks](https://arxiv.org/abs/0903.3178).
- <a id="alam16"></a>Alam, Fink, Pupyrev, 2016. [The bundled crossing number](https://arxiv.org/abs/1608.08161).
- <a id="andrienko11"></a>Andrienko, Andrienko, 2011. [Spatial generalization and aggregation of massive movement data](https://openaccess.city.ac.uk/id/eprint/7614).
- <a id="awerbuch97"></a>Awerbuch, Azar, 1997. [Buy-at-bulk network design](https://doi.org/10.1109/SFCS.1997.646117).
- <a id="beck15"></a>Beck, Sabach, 2015. [Weiszfeld's method: old and new results](https://doi.org/10.1007/s10957-014-0586-7).
- <a id="bernot09"></a>Bernot, Caselles, Morel, 2009. [Optimal transportation networks: models and theory](https://doi.org/10.1007/978-3-540-69315-4).
- <a id="bouts15"></a>Bouts, Speckmann, 2015. [Clustered edge routing](https://doi.org/10.1109/PACIFICVIS.2015.7156356).
- <a id="brandes01"></a>Brandes, 2001. [A faster algorithm for betweenness centrality](https://doi.org/10.1080/0022250X.2001.9990249).
- <a id="broder97"></a>Broder, 1997. [On the resemblance and containment of documents](https://doi.org/10.1109/SEQUEN.1997.666900).
- <a id="buchin11"></a>Buchin, Speckmann, Verbeek, 2011. [Flow map layout via spiral trees](https://doi.org/10.1109/TVCG.2011.202).
- <a id="buchin11b"></a>Buchin, Buchin, Gudmundsson, Löffler, Luo, 2011. [Detecting commuting patterns by clustering subtrajectories](https://doi.org/10.1142/S0218195911003638).
- <a id="callahan95"></a>Callahan, Kosaraju, 1995. [A decomposition of multidimensional point sets with applications to k-nearest-neighbors and n-body potential fields](https://doi.org/10.1145/200836.200853).
- <a id="campbell05"></a>Campbell, Ernst, Krishnamoorthy, 2005. [Hub arc location problems: part I, introduction and results](https://doi.org/10.1287/mnsc.1050.0407).
- <a id="campbell94"></a>Campbell, 1994. [Integer programming formulations of discrete hub location problems](https://doi.org/10.1016/0377-2217(94)90318-2).
- <a id="campello13"></a>Campello, Moulavi, Sander, 2013. [Density-based clustering based on hierarchical density estimates](https://doi.org/10.1007/978-3-642-37456-2_14).
- <a id="chu08"></a>Chu, Wong, 2008. [FLUTE: fast lookup table based rectilinear Steiner minimal tree algorithm for VLSI design](https://doi.org/10.1109/TCAD.2007.907068).
- <a id="chvatal79"></a>Chvátal, 1979. [A greedy heuristic for the set-covering problem](https://doi.org/10.1287/moor.4.3.233).
- <a id="cui08"></a>Cui, Zhou, Qu, Wong, Li, 2008. [Geometry-based edge clustering for graph visualization](https://doi.org/10.1109/TVCG.2008.135).
- <a id="dickerson05"></a>Dickerson, Eppstein, Goodrich, Meng, 2005. [Confluent drawings: visualizing non-planar diagrams in a planar way](https://arxiv.org/abs/cs/0212046).
- <a id="duda72"></a>Duda, Hart, 1972. [Use of the Hough transformation to detect lines and curves in pictures](https://doi.org/10.1145/361237.361242).
- <a id="dwyer13"></a>Dwyer, Henry Riche, Marriott, Mears, 2013. [Edge compression techniques for visualization of dense directed graphs](https://ialab.it.monash.edu/~timd/Dwyer2013EdgeCompression.pdf).
- <a id="edelsbrunner02"></a>Edelsbrunner, Letscher, Zomorodian, 2002. [Topological persistence and simplification](https://doi.org/10.1007/s00454-002-2885-2).
- <a id="ersoy11"></a>Ersoy, Hurter, Paulovich, Cantareiro, Telea, 2011. [Skeleton-based edge bundling for graph visualization](https://doi.org/10.1109/TVCG.2011.233).
- <a id="evans09"></a>Evans, Lambiotte, 2009. [Line graphs, link partitions and overlapping communities](https://arxiv.org/abs/0903.2181).
- <a id="fink16"></a>Fink, Hershberger, Suri, Verbeek, 2016. [Bundled crossings in embedded graphs](https://doi.org/10.1007/978-3-662-49529-2_34).
- <a id="fred05"></a>Fred, Jain, 2005. [Combining multiple clusterings using evidence accumulation](https://doi.org/10.1109/TPAMI.2005.113).
- <a id="gansner06"></a>Gansner, Koren, 2006. [Improved circular layouts](https://doi.org/10.1007/978-3-540-70904-6_37).
- <a id="gansner11"></a>Gansner, Hu, North, Scheidegger, 2011. [Multilevel agglomerative edge bundling for visualizing large graphs](https://www.sci.utah.edu/images/people/Alumni/scheidegger/gansner_edge_bundling.pdf).
- <a id="garyfallidis12"></a>Garyfallidis, Brett, Correia, Williams, Nimmo-Smith, 2012. [QuickBundles, a method for tractography simplification](https://doi.org/10.3389/fnins.2012.00175).
- <a id="gilbert67"></a>Gilbert, 1967. [Minimum cost communication networks](https://doi.org/10.1002/j.1538-7305.1967.tb03174.x).
- <a id="hanan66"></a>Hanan, 1966. [On Steiner's problem with rectilinear distance](https://doi.org/10.1137/0114025).
- <a id="holten06"></a>Holten, 2006. [Hierarchical edge bundles: visualization of adjacency relations in hierarchical data](https://doi.org/10.1109/TVCG.2006.147).
- <a id="holten09"></a>Holten, van Wijk, 2009. [Force-directed edge bundling for graph visualization](https://doi.org/10.1111/j.1467-8659.2009.01450.x).
- <a id="hurter12"></a>Hurter, Ersoy, Telea, 2012. [Graph bundling by kernel density estimation](https://doi.org/10.1111/j.1467-8659.2012.03079.x).
- <a id="hurter13"></a>Hurter, Ersoy, Telea, 2013. [Smooth bundling of large streaming and sequence graphs](https://webspace.science.uu.nl/~telea001/uploads/PAPERS/PacificVis13/paper.pdf).
- <a id="jiang26"></a>Jiang, Hong, Meidiana, Zeng, 2026. [Fast and faithful edge bundling using spectral sparsification](https://arxiv.org/abs/2604.26994).
- <a id="kirkpatrick83"></a>Kirkpatrick, Gelatt, Vecchi, 1983. [Optimization by simulated annealing](https://doi.org/10.1126/science.220.4598.671).
- <a id="kuhn55"></a>Kuhn, 1955. [The Hungarian method for the assignment problem](https://doi.org/10.1002/nav.3800020109).
- <a id="lambert10"></a>Lambert, Bourqui, Auber, 2010. [Winding Roads: routing edges into bundles](https://doi.org/10.1111/j.1467-8659.2009.01700.x).
- <a id="lee07"></a>Lee, Han, Whang, 2007. [Trajectory clustering: a partition-and-group framework](https://doi.org/10.1145/1247480.1247546).
- <a id="lhuillier17"></a>Lhuillier, Hurter, Telea, 2017. [FFTEB: edge bundling of huge graphs by the fast Fourier transform](https://hal-enac.archives-ouvertes.fr/hal-01533755).
- <a id="lhuillier17b"></a>Lhuillier, Hurter, Telea, 2017. [State of the art in edge and trail bundling techniques](https://doi.org/10.1111/cgf.13213).
- <a id="lindeberg98"></a>Lindeberg, 1998. [Edge detection and ridge detection with automatic scale selection](https://doi.org/10.1023/A:1008097225773).
- <a id="luxburg07"></a>von Luxburg, 2007. [A tutorial on spectral clustering](https://arxiv.org/abs/0711.0189).
- <a id="magnanti84"></a>Magnanti, Wong, 1984. [Network design and transportation planning: models and algorithms](https://doi.org/10.1287/trsc.18.1.1).
- <a id="mcmurchie95"></a>McMurchie, Ebeling, 1995. [PathFinder: a negotiation-based performance-driven router for FPGAs](https://doi.org/10.1145/201310.201328).
- <a id="meyerson00"></a>Meyerson, Munagala, Plotkin, 2000. [Cost-distance: two metric network design](https://doi.org/10.1109/SFCS.2000.892327).
- <a id="murray26"></a>Murray, 1926. [The physiological principle of minimum work: I. The vascular system and the cost of blood volume](https://doi.org/10.1073/pnas.12.3.207).
- <a id="nachmanson15"></a>Nachmanson, Prutkin, Lee, Riche, Holroyd, Chen, 2015. [GraphMaps: browsing large graphs as interactive maps](https://arxiv.org/abs/1506.06745).
- <a id="nocaj13"></a>Nocaj, Brandes, 2013. [Stub bundling and confluent spirals for geographic networks](https://kops.uni-konstanz.de/entities/publication/2cad6ab7-003a-4c25-9fc6-025887b6baf7).
- <a id="nollenburg11"></a>Nöllenburg, Wolff, 2011. [Drawing and labeling high-quality metro maps by mixed-integer programming](https://doi.org/10.1109/TVCG.2010.81).
- <a id="okelly87"></a>O'Kelly, 1987. [A quadratic integer program for the location of interacting hub facilities](https://doi.org/10.1016/S0377-2217(87)80007-3).
- <a id="peysakhovich15"></a>Peysakhovich, Hurter, Telea, 2015. [Attribute-driven edge bundling for general graphs with applications in trail analysis](https://doi.org/10.1109/PACIFICVIS.2015.7156354).
- <a id="phan05"></a>Phan, Xiao, Yeh, Hanrahan, Winograd, 2005. [Flow map layout](https://doi.org/10.1109/INFVIS.2005.1532150).
- <a id="pupyrev16"></a>Pupyrev, Nachmanson, Bereg, Holroyd, 2016. [Edge routing with ordered bundles](https://arxiv.org/abs/1209.4227).
- <a id="rao92"></a>Rao, Sadayappan, Hwang, Shor, 1992. [The rectilinear Steiner arborescence problem](https://doi.org/10.1007/BF01758754).
- <a id="sanders05"></a>Sanders, Schultes, 2005. [Highway hierarchies hasten exact shortest path queries](https://doi.org/10.1007/11561071_51).
- <a id="selassie11"></a>Selassie, Heller, Heer, 2011. [Divided edge bundling for directional network data](https://doi.org/10.1109/TVCG.2011.190).
- <a id="spielman11"></a>Spielman, Srivastava, 2011. [Graph sparsification by effective resistances](https://arxiv.org/abs/0803.0929).
- <a id="strehl02"></a>Strehl, Ghosh, 2002. [Cluster ensembles: a knowledge reuse framework for combining multiple partitions](https://www.jmlr.org/papers/v3/strehl02a.html).
- <a id="telea10"></a>Telea, Ersoy, 2010. [Image-based edge bundles: simplified visualization of large graphs](https://doi.org/10.1111/j.1467-8659.2009.01680.x).
- <a id="wallinger22"></a>Wallinger, Archambault, Auber, Nöllenburg, Peltonen, 2022. [Edge-path bundling: a less ambiguous edge bundling approach](https://arxiv.org/abs/2108.05467).
- <a id="wallinger23"></a>Wallinger, Archambault, Auber, Nöllenburg, Peltonen, 2023. [Faster edge-path bundling through graph spanners](https://diglib.eg.org/handle/10.1111/cgf14789).
- <a id="wu17"></a>Wu, Zeng, Zhu, Yu, 2017. [MLSEB: edge bundling using moving least squares approximation](https://arxiv.org/abs/1709.01221).
- <a id="wybrow12"></a>Wybrow, Marriott, Stuckey, 2012. [Orthogonal hyperedge routing](https://doi.org/10.1007/978-3-642-31223-6_10).
- <a id="xia03"></a>Xia, 2003. [Optimal paths related to transport problems](https://www.math.ucdavis.edu/~saito/data/optxport/CCMtransport.pdf).
- <a id="zangwill68"></a>Zangwill, 1968. [Minimum concave cost flows in certain networks](https://doi.org/10.1287/mnsc.14.7.429).
- <a id="zeng19"></a>Zeng, Shen, Jiang, Telea, 2019. [Route-aware edge bundling for visualizing origin-destination trails in urban traffic](https://diglib.eg.org/handle/10.1111/cgf13712).
- <a id="zhu14"></a>Zhu, Guo, 2014. [Mapping large spatial flow data with hierarchical clustering](https://metatoc.com/papers/43809-mapping-large-spatial-flow-data-with-hierarchical-clustering).
- <a id="zwan16"></a>van der Zwan, Codreanu, Telea, 2016. [CUBu: universal real-time bundling for large graphs](https://doi.org/10.1109/TVCG.2016.2515611).

<!-- ste-enable -->

[ahn10]: #ahn10
[alam16]: #alam16
[andrienko11]: #andrienko11
[awerbuch97]: #awerbuch97
[beck15]: #beck15
[bernot09]: #bernot09
[bouts15]: #bouts15
[brandes01]: #brandes01
[broder97]: #broder97
[buchin11]: #buchin11
[buchin11b]: #buchin11b
[callahan95]: #callahan95
[campbell05]: #campbell05
[campbell94]: #campbell94
[campello13]: #campello13
[chu08]: #chu08
[chvatal79]: #chvatal79
[cui08]: #cui08
[dickerson05]: #dickerson05
[duda72]: #duda72
[dwyer13]: #dwyer13
[edelsbrunner02]: #edelsbrunner02
[ersoy11]: #ersoy11
[evans09]: #evans09
[fink16]: #fink16
[fred05]: #fred05
[gansner06]: #gansner06
[gansner11]: #gansner11
[garyfallidis12]: #garyfallidis12
[gilbert67]: #gilbert67
[hanan66]: #hanan66
[holten06]: #holten06
[holten09]: #holten09
[hurter12]: #hurter12
[hurter13]: #hurter13
[jiang26]: #jiang26
[kirkpatrick83]: #kirkpatrick83
[kuhn55]: #kuhn55
[lambert10]: #lambert10
[lee07]: #lee07
[lhuillier17]: #lhuillier17
[lhuillier17b]: #lhuillier17b
[lindeberg98]: #lindeberg98
[luxburg07]: #luxburg07
[magnanti84]: #magnanti84
[mcmurchie95]: #mcmurchie95
[meyerson00]: #meyerson00
[murray26]: #murray26
[nachmanson15]: #nachmanson15
[nocaj13]: #nocaj13
[nollenburg11]: #nollenburg11
[okelly87]: #okelly87
[peysakhovich15]: #peysakhovich15
[phan05]: #phan05
[pupyrev16]: #pupyrev16
[rao92]: #rao92
[sanders05]: #sanders05
[selassie11]: #selassie11
[spielman11]: #spielman11
[strehl02]: #strehl02
[telea10]: #telea10
[wallinger22]: #wallinger22
[wallinger23]: #wallinger23
[wu17]: #wu17
[wybrow12]: #wybrow12
[xia03]: #xia03
[zangwill68]: #zangwill68
[zeng19]: #zeng19
[zhu14]: #zhu14
[zwan16]: #zwan16
