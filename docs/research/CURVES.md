# Curve families for routed edges

This note is the research item CURV-R of the [roadmap](../ROADMAP.md). It gives the curve families that can turn a route into a smooth curve, with their math.

Two later items use this note:

- CURV2 builds more curve types. The [build order](#the-build-order-for-curv2) gives each type with its options and its measure targets.
- HWC-D gives room to the bends of wide bundles. The section [Room for the bends of a bundle](#room-for-the-bends-of-a-bundle) gives the formulas.

The measures `C1` to `C11` and the proposed rules `curve-clear`, `curve-ends`, `curve-g1` and `curve-simple` come from [the measures of a good result](MEASURES.md).

## Summary

- The note gives 16 curve families in four groups. The groups are corner shapes (7), curves through the points (5), curves with exact offsets (2) and global fair curves (2).
- Each family has its formula, its continuity, its control, its options, its cost, its curvature, its offsets, its clearance and its segments.
- Five families give exact offsets. They are the circular fillet, the fillet with a variable radius, the biarc and arc spline, and the Pythagorean-hodograph (PH) curves. The conic corner also gives them when it is a circle. The other 11 give approximate offsets only.
- For a single orthogonal route, the Bezier spiral corner wins. It is G2, local, `O(1)` for each corner, and an SVG path draws it with no approximation.
- For a lane of a highway, concentric arcs win, as `highwayCurves` uses them today. Their offsets are exact, so the lane spacing stays exact.
- For a merge or a split, the quintic S wins. It is G2, and its largest curvature is the smallest of the G2 shapes that the note compares.
- A G2 corner needs more leg than a fillet for the same smallest radius. At 90°, it needs 1.20 to 1.87 times the tangent length of the fillet. HWC-D uses this factor.
- The CURV2 build order has 8 steps. The first five are `smooth`, `clothoid`, the S of a merge, `hobby` and `bspline`.

## The state of today

The curve layer has four types and one highway curve. The function `curveOf` gives the segments of a type. `toSvgPath` writes them as SVG path data, and `sampleCurve` gives points within a tolerance.

| Type | Shape | Continuity | Family in this note |
|---|---|---|---|
| `straight` | The polyline | G0 | The baseline |
| `rounded` | A quadratic Bezier curve at each corner, written as a cubic segment | G1 | [F3](#f3-conic-corner), with the weight 1 (a parabola) |
| `spline` | A centripetal Catmull-Rom spline, one cubic segment for each leg | G1 | [F9](#f9-catmull-rom-splines), with `α = 0.5` |
| `arc` | A circular arc at each corner | G1 | [F1](#f1-circular-fillet) |
| `highwayCurves` | Concentric arcs at the bends of a bundle, and an S of two arcs at each merge and split | G1 | [F1](#f1-circular-fillet) and [F8](#f8-biarc-and-arc-spline) |

The free space keeps each curve clear of the boxes. `fitSize` tries the full size of a piece, then halves the interval 8 times. The size is the radius of a corner or the scale of the tangents of a spline piece. Each try samples the piece and asks `CurveSpace.addsHit` if the samples go through a box that the polyline avoids.

The segments of a curve are `move`, `line`, `cubic` and `arc`. A renderer maps them to SVG path commands, to canvas calls or to the vertices of a mesh. Thus a new family must give its curve as lines, cubic Bezier curves and circular arcs. A family with another kind of piece gives an approximation with these segments.

## Notation and basic math

- `B(t)` is a parametric curve, with `t` from 0 to 1. `B'` and `B''` are its first and second derivatives.
- `s` is the arc length, and `θ(s)` is the angle of the tangent.
- `κ` is the signed curvature: `κ = dθ/ds = (x' y'' - y' x'') / (x'^2 + y'^2)^(3/2)`. The radius of curvature is `1 / abs(κ)`.
- A corner has the vertex `V`. The unit direction of the leg into it is `u`, and the unit direction of the leg out of it is `w`. Its turn is `φ`, from 0 to `π`.
- `T` is the tangent length of a corner shape: the distance from `V` to each point where the shape leaves a leg.
- `P_0 .. P_n` are the control points of a Bezier curve of degree `n`.
- `d` is the distance of an offset, and `N(t)` is the unit normal. The offset of `B` is `B_d(t) = B(t) + d N(t)`.
- `u` (in a measure) is the unit of length of a board, as in MEAS0.

### Curvature of a Bezier curve at its ends

At `t = 0`, a Bezier curve of degree `n` has the curvature `κ(0) = ((n - 1) / n) · cross(P_1 - P_0, P_2 - P_1) / abs(P_1 - P_0)^3`. A rational curve with the weights `w_0`, `w_1` and `w_2` multiplies this value by `w_0 w_2 / w_1^2`. The formula gives the curvature jump at each joint of a corner shape and a straight leg.

### Offsets

The offset at the distance `d` has the curvature `κ_d = κ / (1 - d κ)`, with `d` positive to the side of the center of curvature. The offset has a cusp where `d κ = 1`. Thus an inner lane at the distance `d` has a cusp at a bend with a radius of `d` or less.

An offset keeps G1 and G2 where `1 - d κ > 0`. The offset of a circle is a circle and the offset of a line is a line. The offset of a polynomial curve is in general not a polynomial curve. The exact offset of a cubic Bezier curve is an algebraic curve of degree 10 ([Levien 2022][levien22]).

## Continuity and its visual effect

| Order | What joins | Visual effect |
|---|---|---|
| G0 | The points | A kink at each joint. The polyline of a router is G0. |
| G1 | The tangents | No kink. The curvature can jump, and the eye sees a small bump where a straight leg meets an arc. |
| G2 | The curvatures | No jump of the curvature. The reflections and the stroke look like one continuous shape ([Figma 2018][figma18]). |
| G3 | The rates of change of the curvature | No jump in the rate of change of the curvature. The effect is small at the scale of a line of a diagram. |

[Barsky and DeRose][barsky88] define the order `Gn` with no dependence on the parameter. A fillet is G1. Its curvature jumps from 0 to `1/r` at each tangent point. Road and rail design put a clothoid between a line and an arc for this reason. A vehicle cannot change its curvature in no time ([Meek 1992][meek92]).

Squircle corners show the same effect in user interfaces. A rounded rectangle has a jump of the curvature at each tangent point. A squircle has a continuous curvature, and it looks like one smooth shape ([Figma 2018][figma18]).

## Fairness

A fair curve has a curvature plot with few extrema and with no sudden change. The measures of MEAS0 cover fairness:

- `C2` gives the jumps of the curvature (the G2 defect).
- `C3` gives the bending energy `L · ∫ κ^2 ds`. [Horn 1983][horn83] uses it for the curve of least energy.
- `C4` gives the curvature variation `L^3 · ∫ (dκ/ds)^2 ds`. [Moreton 1993][moreton93] uses it for the minimum variation curve.
- `C11` counts the extrema of the curvature and its changes of sign.

[Levien and Séquin 2009][levien09b] argue that fairness is the most important property of an interpolating spline. Fairness often conflicts with locality. They also show that a G2 spline with their two main properties is made of pieces of one generator curve, for example the Euler spiral.

## Clearance: how a curve keeps clear of boxes

A curve must go through no box that its polyline avoids. This is the rule `curve-clear` of MEAS0. The families use four methods.

1. **Shrink and test.** The function `fitSize` of today shrinks one size of a piece and samples each try. It works with each family. It costs up to 9 samples of the piece, each with a query of the grid.
2. **The corner triangle.** A convex shape that leaves the legs at the tangent length `T` stays in the triangle `(V - T u, V, V + T w)`. This is true for each corner family of this note. Thus a test of this triangle against the boxes replaces the samples. The test is exact for the box test, and it needs no tolerance.
3. **The convex hull.** A Bezier curve stays in the convex hull of its control points. A span of a B-spline of degree `k` stays in the hull of its `k + 1` control points ([Piegl 1997][piegl97]). A hull that misses each box proves that the piece is clear. Corridor methods put the control points in a free region with linear constraints ([Choi 2009][choi09], [Arslan 2025][arslan25]).
4. **The corridor.** A global method fits a spline in a polygon of free space. It splits the spline where it leaves the polygon, and fits each part again. The edge router of Graphviz works this way ([Dobkin 1997][dobkin97]).

An interpolating curve goes through each vertex of the polyline. On an orthogonal route, it swings out of the corner on the outer side. A corner shape cuts the corner on the inner side, in the corner triangle. The router keeps a clearance on both sides of a leg, but a box can be in the inner side of a turn. Thus each family must test, and the triangle and the hull tests are the cheapest.

## How to read a family entry

Each family has a short definition, a formula and one table. The rows of the table are:

| Row | Meaning |
|---|---|
| Continuity | The order of geometric continuity inside the curve and at its joints with the legs. |
| Control | Local: a change of one point changes a bounded part of the curve. Global: it changes the whole curve. |
| Options | The values that a consumer sets, with their ranges. |
| Cost | The time to make the curve of a polyline with `k` points. |
| Curvature | The formula of the curvature, or a bound. |
| Offset | Exact: the offset is a curve of the same kind, or a rational curve. Approximate: the offset needs a fit. |
| Clearance | The method of the previous section that fits the family. |
| Segments | How the family writes `CurveSegment` values: lines, cubic curves and arcs. |
| Sources | The studies of the family. |

## Corner shapes

A corner shape replaces each vertex of the polyline with a curve from the leg in to the leg out. The legs stay straight. All corner shapes have local control, and all stay in the corner triangle.

### F1 Circular fillet

The arc of the radius `r` is tangent to the two legs. Its tangent length is `T = r · tan(φ/2)`, and its center is at the distance `r` from each leg. The arc is `r φ` long. It cuts the corner by `r · (1 / cos(φ/2) - 1)` at the vertex. The type `arc` and the bends of `highwayCurves` use this family.

| Row | Value |
|---|---|
| Continuity | G1. The curvature jumps from 0 to `1/r` at each tangent point. |
| Control | Local, one corner. |
| Options | `radius`, 0 to 48, default 12. |
| Cost | `O(1)` for each corner, plus the clearance test. |
| Curvature | `κ = 1/r` on the arc, 0 on the legs. |
| Offset | Exact. The offset is a concentric arc with the radius `r ± d`. The inner offset has a cusp when `d ≥ r`. |
| Clearance | The corner triangle, or shrink and test. |
| Segments | One `arc`. SVG writes `A r r 0 0 f x y`, with the sweep flag `f` from the sign of the turn. |
| Sources | [SVG 2][svg2], [Meek 1992][meek92] |

### F2 Fillet with a variable radius

Each corner gets its own radius from a rule. The shape stays a circular arc, so the offsets stay exact. The rules are:

- **Fixed tangent length.** `r_i = T / tan(φ_i/2)`. Each corner uses the same length of its legs. A gentle turn gets a large radius, and a sharp turn gets a small radius.
- **Share of the leg.** `r_i = a · min(L_in, L_out) / tan(φ_i/2)`, with `a` from 0 to 0.5. The corners of a short leg do not overlap.
- **Largest clear radius.** `r_i` is the largest radius up to `R` that keeps the arc clear. A large radius gives a small curvature, so this rule gives the best `C5`.
- **Width of the bundle.** `r_i = r_min + W/2` for a bundle of the width `W`. `highwayCurves` uses this rule today.

In 3D modelling, a fillet with a variable radius is a blend whose radius changes along an edge. In the plane, a corner whose curvature changes along the curve is a spiral corner ([F6](#f6-clothoid-corner) and [F7](#f7-bezier-spiral-corner)).

| Row | Value |
|---|---|
| Continuity | G1, as F1. |
| Control | Local. The rule `largest clear radius` reads the boxes near the corner. |
| Options | `rule`: `radius`, `tangent`, `share` or `clear`, default `radius`. `radius` or `tangent`: 0 to 48. `share`: 0 to 0.5, default 0.5. |
| Cost | `O(1)` for each corner. The rule `clear` costs one search of `fitSize`. |
| Curvature | `κ_i = 1/r_i` on each arc. |
| Offset | Exact, as F1. |
| Clearance | The corner triangle, or shrink and test. |
| Segments | One `arc` for each corner. |
| Sources | [Meek 1995][meek95], own (HWC) |

### F3 Conic corner

A rational quadratic Bezier curve with the control points `P_0 = V - T u`, `V` and `P_2 = V + T w`, and the weights `1`, `ω` and `1`:

`B(t) = ((1-t)^2 P_0 + 2 ω t (1-t) V + t^2 P_2) / ((1-t)^2 + 2 ω t (1-t) + t^2)`

The weight `ω` selects the conic. A weight of 1 gives a parabola: the type `rounded` of today. A weight under 1 gives an ellipse, and a weight over 1 gives a hyperbola. The weight `ω = cos(φ/2)` gives the circular arc of F1. The parabola is also the corner of a quadratic B-spline ([F11](#f11-b-splines-nurbs-and-corner-cutting)).

| Row | Value |
|---|---|
| Continuity | G1. The curvature at each joint is `sin(φ) / (2 ω^2 T)`. |
| Control | Local, one corner. |
| Options | `radius` (the tangent length `T`), 0 to 48. `weight`, 0.25 to 4 on a log scale, default 1. |
| Cost | `O(1)` for each corner. |
| Curvature | At 90° and `ω = 1`, the curvature is `0.5/T` at the joints and `1.41/T` at the middle. A fillet with the same `T` has `1/T`. |
| Offset | Exact only for the circle. For the other weights, the offset of [Tiller and Hanson][tiller84] (offset the legs of the control polygon) is the best method for quadratic curves ([Elber 1997][elber97]). |
| Clearance | The corner triangle. Each conic with `ω > 0` stays in it. |
| Segments | A circle gives one `arc`. A parabola gives one exact `cubic`, with the control points 2/3 of the way to `V`. SVG has no rational curve, so other weights give approximate cubic segments. |
| Sources | [Piegl 1997][piegl97], [Elber 1997][elber97] |

### F4 Bezier curves with tension

A polynomial Bezier curve gets its shape from the length of its handles. The handle ratio `k` is the tension.

- **Cubic corner.** `c_1 = P_0 + k (V - P_0)` and `c_2 = P_2 + k (V - P_2)`. The ratio `k = 2/3` gives the parabola. The ratio `k = (4/3) tan(φ/4) / tan(φ/2)` gives a near circle: 0.5523 at 90°. A ratio near 1 gives a shape near the squircle.
- **Cubic S.** A lane shifts by `d` along the length `l`, with `c_1 = P_0 + h u` and `c_2 = P_3 - h u`. The handle `h = l/3` gives `y = d (3 t^2 - 2 t^3)`.
- **Quintic S.** The curve `y = d (10 t^3 - 15 t^4 + 6 t^5)`, `x = l t` has zero curvature at both ends. It is G2 with the legs.

| Row | Value |
|---|---|
| Continuity | G1 for the cubic corner and the cubic S. G2 for the quintic S. The cubic corner has the joint curvature `(2/3) (1 - k) / (k^2 T)` at 90°. |
| Control | Local. |
| Options | `handle` (`k`), 0.3 to 1, step 0.05, default 0.55 for a near circle. For an S: `shape`, `cubic` or `quintic`. |
| Cost | `O(1)` for each corner or S. |
| Curvature | `κ(t) = cross(B', B'') / abs(B')^3`. For the ends, refer to [Notation and basic math](#notation-and-basic-math). |
| Offset | Approximate. A cubic offset has an exact form of degree 10. Fits give a small error ([Levien 2022][levien22], [Elber 1997][elber97]). |
| Clearance | The convex hull. The hull of the cubic corner is in the corner triangle for `k` from 0 to 1. |
| Segments | One exact `cubic`. A quintic S has no SVG command. Four cubic Hermite pieces keep the error under `0.003 d`. |
| Sources | [Pomax][pomax], [Kuo 2024][kuo24] (the error of the near circle), own (the S numbers) |

### F5 Superellipse corner

The superellipse is the curve `abs(x/a)^n + abs(y/b)^n = 1`. A quarter of it from `(a, 0)` to `(0, b)` is a corner with `T = a = b`. The exponent `n = 2` gives the circle. The exponent `n = 4` gives the squircle. For a turn that is not 90°, an affine map puts the quarter on the legs.

| Row | Value |
|---|---|
| Continuity | For `n > 2`, the curvature is 0 at the joints, so the corner is G2 with the legs. For `n ≥ 4`, the rate of change of the curvature is also 0 there, so the corner is G3. |
| Control | Local, one corner. |
| Options | `radius` (the tangent length `T`), 0 to 48. `exponent`, 2 to 8, default 4. |
| Cost | `O(1)` for each corner, plus the fit of two cubic segments. |
| Curvature | `x = a cos(t)^(2/n)`, `y = b sin(t)^(2/n)`. Use the parametric formula. The largest curvature is on the diagonal: `2.52/T` for `n = 4` at 90°. |
| Offset | Approximate. |
| Clearance | The corner triangle. The shape cuts the corner by only `0.225 T` at `n = 4`, against `0.414 T` for the fillet. |
| Segments | Two cubic segments, split at the diagonal, or one cubic with `k = 0.9` as a near shape. That cubic has a joint curvature of `0.08/T`, not 0. |
| Sources | [Superellipse][superellipse], [Figma 2018][figma18] |

### F6 Clothoid corner

The clothoid (Euler spiral) has a curvature that changes linearly with the arc length: `κ(s) = s / A^2`. Its angle is `θ(s) = s^2 / (2 A^2)`. Its points come from the Fresnel integrals: `x(s) = ∫ cos(θ) ds` and `y(s) = ∫ sin(θ) ds`.

A corner is a spiral, an arc of the radius `R`, and a second spiral. The option `spiral` (`q`) is the share of the turn in the two spirals:

- Each spiral turns `θ_s = q φ / 2` and is `L_s = q φ R` long. Thus `A^2 = R L_s`.
- The arc turns `(1 - q) φ`. A share of 0 gives the fillet F1. A share of 1 gives two spirals with no arc.
- The shift of the arc is `p = y(L_s) - R (1 - cos(θ_s))`, and `k = x(L_s) - R sin(θ_s)`.
- The tangent length is `T = (R + p) tan(φ/2) + k`. Road design uses these formulas for a transition curve ([Meek 1992][meek92]).

For a turn of `π/4` or less in each spiral, short series give the points with no Fresnel routine:

- `x(s) = s - s^5 / (40 A^4) + s^9 / (3456 A^8)`
- `y(s) = s^3 / (6 A^2) - s^7 / (336 A^6) + s^11 / (42240 A^10)`

For a large turn, the rational approximations of [Heald 1985][heald85] have a largest error from `1.7e-3` to `4e-8`. [Bertolazzi and Frego 2015][bertolazzi15] fit one clothoid between two points with two tangents (G1 Hermite data) in a few Newton steps.

| Row | Value |
|---|---|
| Continuity | G2. The curvature rises linearly from 0, stays at `1/R` on the arc, then falls linearly to 0. |
| Control | Local, one corner. |
| Options | `radius` (`R`, the smallest radius), 0 to 48, default 12. `spiral` (`q`), 0 to 1, step 0.05, default 0.5. `tolerance` of the segments, 0.05 to 1, default 0.25. |
| Cost | `O(1)` for each corner: a series of 3 terms and a fit of the segments. |
| Curvature | `κ(s) = s / A^2` in each spiral. At 90° and the same `T`, the peak is `1.20/T` for `q = 0.25`, `1.42/T` for `q = 0.5` and `1.87/T` for `q = 1`. |
| Offset | Approximate. The offset of a clothoid is not a clothoid. Arcs fit it well ([Levien 2024][levien24], [Meek 2004][meek04]). |
| Clearance | The corner triangle. |
| Segments | One `arc` for the middle. Each spiral gives one or two cubic segments fitted to its ends and its curvature, or a few arcs. |
| Sources | [Meek 1992][meek92], [Levien 2009][levien09], [Bertolazzi 2015][bertolazzi15], [Heald 1985][heald85] |

### F7 Bezier spiral corner

A cubic Bezier spiral replaces each clothoid of F6 with one cubic segment. The curvature of the segment rises monotonically from 0 to `1/R`. The first three control points are collinear, so the curvature is 0 at the leg. The last control points match the tangent and the curvature `1/R` of the arc ([Walton 1996][walton96], [Walton 2003][walton03]).

The corner smoothing of Figma uses the same build: a cubic, an arc and a cubic. Its option `smoothing` (`ξ`, from 0 to 1) moves the start of the cubic away from the arc. At `ξ = 0`, the corner is a fillet. At `ξ = 1`, the arc goes to a point. A value of approximately 0.6 gives the corner of the icons of iOS ([Figma 2018][figma18]).

| Row | Value |
|---|---|
| Continuity | G2. |
| Control | Local, one corner. |
| Options | `radius` (`R`), 0 to 48, default 12. `smoothing` (`ξ`), 0 to 1, step 0.05, default 0.6. |
| Cost | `O(1)` for each corner, in closed form. |
| Curvature | The cubic formula. The conditions of [Walton 1996][walton96] keep it monotone in each spiral, so each corner has one extremum (`C11 = 1`). |
| Offset | Approximate, as F4. |
| Clearance | The corner triangle. The hull of each cubic is in it. |
| Segments | `cubic`, `arc`, `cubic`. SVG writes `C`, `A` and `C` with no approximation. |
| Sources | [Walton 1996][walton96], [Walton 2003][walton03], [Figma 2018][figma18] |

## Curves through the points and between tangents

These families make one curve along all the points of the polyline. On a free-angle polyline with short legs, they give a smoother result than a corner shape.

### F8 Biarc and arc spline

A biarc is two circular arcs with one common tangent at their joint. It joins the points `P_0` and `P_1` with the unit tangents `t_0` and `t_1`. The joint can be at each point of a circle through `P_0` and `P_1`, so biarcs make a family with one free value ([Bertolazzi 2017][bertolazzi17]).

With equal tangent lengths `α`, the control points are `Q_0 = P_0 + α t_0` and `Q_1 = P_1 - α t_1`. Then `abs(Q_1 - Q_0) = 2 α`. With `v = P_1 - P_0`, `α` is the positive root of `2 (t_0·t_1 - 1) α^2 - 2 (v·(t_0 + t_1)) α + v·v = 0`. The joint is `(Q_0 + Q_1) / 2`.

An arc spline is a chain of arcs with G1 joints. [Meek and Walton 1995][meek95] fit an arc spline to a smooth curve. The S of a merge in `highwayCurves` is a biarc with two equal radii. For a shift `d` along the length `l`, each radius is `(l^2 + d^2) / (4 d)`.

| Row | Value |
|---|---|
| Continuity | G1. The curvature is constant on each arc and jumps at each joint. |
| Control | Local. Each biarc reads two points and two tangents. |
| Options | `joint`: `equal` (equal tangent lengths) or `incenter` (the joint of Sabin), default `equal`. `radius`: the smallest radius, 0 to 48. |
| Cost | `O(1)` for each pair of points: one quadratic equation, or one linear system of 2 by 2. |
| Curvature | `±1/r_1` and `±1/r_2`. At the inflection of an S, the jump is `2/r`. |
| Offset | Exact. Each arc offsets to a concentric arc. |
| Clearance | Shrink and test on each arc, or the triangle of each arc. |
| Segments | Two `arc` segments for each pair. |
| Sources | [Bertolazzi 2017][bertolazzi17], [Meek 1995][meek95], own (HWC) |

### F9 Catmull-Rom splines

A Catmull-Rom spline goes through each point. Each piece between two points is a cubic curve with tangents from the neighbour points ([Catmull 1974][catmull74]). The knots are `t_(i+1) = t_i + abs(P_(i+1) - P_i)^α`. The value `α = 0` gives the uniform spline, 0.5 the centripetal spline and 1 the chordal spline.

The tangent at the point `i` is `m_i = (P_i - P_(i-1)) / Δ_(i-1) - (P_(i+1) - P_(i-1)) / (Δ_(i-1) + Δ_i) + (P_(i+1) - P_i) / Δ_i`, with `Δ_i = t_(i+1) - t_i`. The cubic segment of the leg `i` has the control points `P_i + m_i Δ_i / 3` and `P_(i+1) - m_(i+1) Δ_i / 3`.

[Yuksel 2011][yuksel11] proves that only the centripetal spline has no cusp and no self-intersection in a piece. It also stays nearer to the points than the other two. The type `spline` of today is the centripetal spline.

| Row | Value |
|---|---|
| Continuity | C1, so G1. The curvature jumps at each point. |
| Control | Local. A point changes the 4 pieces near it. |
| Options | `alpha`, 0 to 1, step 0.05, default 0.5. `tension`, 0 to 1, default 0 (as today). |
| Cost | `O(k)`. |
| Curvature | The cubic formula on each piece. |
| Offset | Approximate, as F4. |
| Clearance | Shrink and test (the scale of the tangents), as today. The curve goes through each vertex and swings out of the corner. |
| Segments | One `cubic` for each leg. |
| Sources | [Catmull 1974][catmull74], [Yuksel 2011][yuksel11] |

### F10 Hobby curve

[Hobby 1986][hobby86] gives the curves of METAFONT and MetaPost. The method chooses the angles of the tangents at the points so that a "mock curvature" is continuous. Each leg is then one cubic segment.

- Let `ψ_i` be the turn of the polyline at the point `i`, and `d_i` the length of the leg `i`. The unknowns are `θ_i`, the angle of the tangent out of the point `i` from its leg, and `φ_i`, the angle into the point `i`.
- At each inner point, `θ_i + φ_i + ψ_i = 0`. With a tension of 1, the mock curvature is the same on the two sides: `(θ_(i-1) + 2 φ_i) / d_(i-1) = (2 θ_i + φ_(i+1)) / d_i`.
- The system is tridiagonal, so one pass solves it in `O(k)`. The option `curl` sets the curvature at the open ends.
- The control points of a leg are `P_i + d_i ρ(θ, φ) / τ` along the tangent, with the velocity function `ρ(θ, φ) = (2 + sqrt(2) (sin θ - sin(φ)/16) (sin φ - sin(θ)/16) (cos θ - cos φ)) / (3 (1 + ((sqrt(5) - 1)/2) cos θ + ((3 - sqrt(5))/2) cos φ))`.

A tension `τ` larger than 1 pulls the curve toward the polyline. MetaPost keeps the tension from 3/4 to 4 ([Jackowski 2013][jackowski13]).

| Row | Value |
|---|---|
| Continuity | G1, with a continuous mock curvature. The true curvature is near G2. |
| Control | Global. A point changes the whole curve, with an effect that falls quickly along the curve. |
| Options | `tension`, 0.75 to 4 on a log scale, default 1. `curl` at each open end, 0 to 4, default 1. The plug normals fix the end angles, as `startNormal` and `endNormal` do for `spline`. |
| Cost | `O(k)`: one tridiagonal solve and one cubic segment for each leg. |
| Curvature | The cubic formula on each piece. A large turn at one point can make an unstable result ([Jackowski 2013][jackowski13]). |
| Offset | Approximate, as F4. |
| Clearance | Shrink and test. A larger tension on the legs near a box keeps the curve near its leg. |
| Segments | One `cubic` for each leg. |
| Sources | [Hobby 1986][hobby86], [Jackowski 2013][jackowski13] |

### F11 B-splines, NURBS and corner cutting

A B-spline of degree `k` is `C(t) = Σ_i N_(i,k)(t) P_i`, with the basis functions `N_(i,k)` on a knot vector. Each basis function is 0 outside `k + 1` knot spans, so the control is local. The curve is `C^(k-1)` at a knot of the multiplicity 1. A knot of the multiplicity `m` lowers the continuity to `C^(k-m)`. A NURBS gives each control point a weight, and a large weight pulls the curve to its point ([Piegl 1997][piegl97]).

A B-spline does not go through its control points. With the polyline as the control polygon, the curve cuts each corner:

- **Degree 2.** Each piece goes from the middle of a leg to the middle of the next leg, with the vertex as its control point. This is the parabola of F3 with `T` at half the leg. Chaikin corner cutting converges to this curve ([Joy][joy-chaikin]).
- **Degree 3.** The uniform cubic B-spline is C2. A span with the control points `P_(i-1)`, `P_i`, `P_(i+1)` and `P_(i+2)` is one cubic Bezier segment with the points `(P_(i-1) + 4 P_i + P_(i+1)) / 6`, `(2 P_i + P_(i+1)) / 3`, `(P_i + 2 P_(i+1)) / 3` and `(P_i + 4 P_(i+1) + P_(i+2)) / 6`.
- **Ends.** A knot of the multiplicity `k + 1` at each end clamps the curve. It starts at the first point along the first leg, so it obeys `curve-ends`.
- **Size of a corner.** On long legs, the cut grows with the leg: `0.236 L` at a 90° corner of a cubic spline with legs of the length `L`. Two more control points at `V - T u` and `V + T w` keep the corner at the size `T`.

| Row | Value |
|---|---|
| Continuity | C2, so G2, for degree 3 with knots of the multiplicity 1. G1 for degree 2. |
| Control | Local: `k + 1` spans. |
| Options | `degree`, integer 2 to 3, default 3. `corner` (`T` of the extra control points), 0 to 48, default 12. The value 0 adds no point. `weight` of the vertex, 0.25 to 4 on a log scale, default 1. |
| Cost | `O(k)`. |
| Curvature | The cubic formula on each span. |
| Offset | Approximate. The method of [Tiller and Hanson][tiller84] offsets the control polygon. |
| Clearance | The convex hull of the control points of each span. A clear hull proves a clear span, with no sample. |
| Segments | One `cubic` for each span of degree 3. A span of degree 2 gives one exact cubic. A NURBS with a weight other than 1 gives approximate cubic segments. |
| Sources | [Piegl 1997][piegl97], [Joy][joy-chaikin] |

### F12 κ-curves

[Yan 2017][yan17] gives a curve through the points with a local maximum of the curvature at each point, and at no other place. Each piece is a quadratic Bezier curve. The curve is G2 except at its inflection points, where it is G1. An iteration finds the middle control points: each step solves a linear system and finds the root of a cubic for each point. Adobe Illustrator and Photoshop use κ-curves in their curvature tool.

| Row | Value |
|---|---|
| Continuity | G2 almost everywhere, G1 at the inflection points. |
| Control | Global, with a small effect far from a change. |
| Options | `iterations`, integer 1 to 50, default 20. |
| Cost | `O(k)` for each iteration. |
| Curvature | The quadratic formula on each piece. Each maximum is at an input point, so `C11` is low. |
| Offset | Approximate, as F3. |
| Clearance | Shrink and test, or the hull of each quadratic piece. The curve goes through each vertex and swings out of the corner. |
| Segments | One exact `cubic` for each quadratic piece. |
| Sources | [Yan 2017][yan17] |

## Curves with exact offsets

### F13 Pythagorean-hodograph curves

A PH curve has a derivative (a hodograph) whose length is a polynomial. In the plane, `x'(t) = u(t)^2 - v(t)^2` and `y'(t) = 2 u(t) v(t)` for two polynomials `u` and `v`. Then `abs(B'(t)) = σ(t) = u^2 + v^2` ([Farouki][farouki-intro]).

- The arc length `s(t) = ∫ σ dt` is a polynomial. Thus a sample at equal arc lengths needs no numeric integration.
- The unit normal `N = (-2 u v, u^2 - v^2) / σ` is rational. Thus each offset `B + d N` is a rational curve of degree `2n - 1`.
- The curvature is `κ = 2 (u v' - u' v) / σ^2`.
- A PH cubic (with `u` and `v` linear) has no inflection, so it cannot make an S. The PH quintic is the first useful degree.
- [Farouki and Neff 1995][farouki95] give four PH quintics for each set of G1 Hermite data. The one with the smallest absolute rotation number has a good shape.

| Row | Value |
|---|---|
| Continuity | C1 or G1 at each joint with Hermite data. PH splines can be C2. |
| Control | Local with Hermite pieces, global with a C2 PH spline. |
| Options | `tangentScale` of the Hermite data, 0.25 to 2, default 1. |
| Cost | `O(1)` for each piece: two quadratic equations with complex values. |
| Curvature | `κ = 2 (u v' - u' v) / σ^2`, rational. |
| Offset | Exact, rational of degree 9 for a quintic. |
| Clearance | The convex hull of the 6 control points of each quintic. |
| Segments | No SVG command fits a quintic or a rational curve. Fit cubic segments to the curve and to each offset. The math stays exact for samples and measures. |
| Sources | [Farouki][farouki-intro], [Farouki 1995][farouki95] |

### Which families give exact offsets

| Family | Offset | Segments of the offset |
|---|---|---|
| Line | Exact: a line | `line` |
| F1 Circular fillet | Exact: a concentric arc | `arc` |
| F2 Fillet with a variable radius | Exact: concentric arcs | `arc` |
| F3 Conic corner | Exact only when it is a circle (`ω = cos(φ/2)`) | `arc`, else approximate |
| F8 Biarc and arc spline | Exact: concentric arcs | `arc` |
| F13 PH curves | Exact: a rational curve of degree `2n - 1` | approximate cubic segments |
| F4, F5, F6, F7, F9, F10, F11, F12 | Approximate | cubic segments or arcs from a fit |
| F14, F15, F16 | Approximate | cubic segments from a fit |

The approximate offsets have three methods:

1. **Control polygon.** [Tiller and Hanson 1984][tiller84] offset each leg of the control polygon along its normal and intersect the neighbour legs. The error falls as `O(n^2)` with `n` subdivisions. It is the best method for quadratic curves ([Elber 1997][elber97]).
2. **Curve fit.** [Levien 2022][levien22] fits one cubic segment to the true offset, with the same end tangents, area and moment. The error falls as `O(n^6)`. Each segment took approximately 12 µs in JavaScript.
3. **Arcs from Euler spirals.** [Levien and Uguray 2024][levien24] convert each curve to Euler spiral pieces and give the offsets as lines or arcs, with a small number of segments.

## Global fair curves

These families minimize a fairness measure over the whole curve. They are slow, but they are the best reference for MEAS2: the gap of a fast family to the fairest curve.

### F14 Elastica (curves of least energy)

The elastica minimizes `∫ (a + b κ^2) ds`. The length term `a` is necessary: with `a = 0`, an interpolating curve has no minimum, except when the points are on a line ([Borbély 2013][borbely13]). The curvature obeys `2 b κ'' + b κ^3 - a κ = 0`, and the solutions are elliptic functions ([Mumford 1994][mumford94], [Horn 1983][horn83]).

| Row | Value |
|---|---|
| Continuity | G2, with a smooth curvature between the points. |
| Control | Global. |
| Options | `lengthWeight` (`a / b`), 0 to 1, default 0.1. `iterations`, integer 10 to 200. |
| Cost | A nonlinear optimization: `O(k)` for each iteration, with many iterations. |
| Curvature | The solution of the equation above. It minimizes `C3` for its length. |
| Offset | Approximate. |
| Clearance | The corridor: constraints in the optimization. |
| Segments | Cubic segments from a fit. |
| Sources | [Horn 1983][horn83], [Mumford 1994][mumford94], [Borbély 2013][borbely13] |

### F15 Minimum variation curves and Euler spiral splines

[Moreton 1993][moreton93] minimizes the curvature variation `∫ (dκ/ds)^2 ds`. A circle and a clothoid have a constant `dκ/ds`, so they are natural pieces of such curves. Levien's Spiro spline is a chain of Euler spiral pieces with G2 joints. It is a practical form of this idea ([Levien 2009][levien09], [Levien and Séquin 2009][levien09b]).

| Row | Value |
|---|---|
| Continuity | G2 at each joint, and a linear curvature in each Spiro piece. |
| Control | Global. |
| Options | `iterations`, integer 5 to 100, default 20. |
| Cost | A Newton solve over the curvature parameters of each piece, `O(k)` for each step. |
| Curvature | Linear in the arc length on each Euler spiral piece. It minimizes `C4` approximately. |
| Offset | Approximate, with arcs as in F6. |
| Clearance | The corridor. |
| Segments | Cubic segments or arcs from a fit of each spiral piece. |
| Sources | [Moreton 1993][moreton93], [Levien 2009][levien09], [Levien and Séquin 2009][levien09b] |

### F16 Smoothing splines

A smoothing spline does not go through the points. It minimizes `Σ_i w_i abs(P_i - C(t_i))^2 + λ ∫ abs(C''(t))^2 dt`. The solution is a natural cubic spline, and a banded system gives it in `O(k)` ([Reinsch 1967][reinsch67]). The value `λ = 0` gives the interpolating spline. A large `λ` gives the line of least squares.

For a route, the weights fix the two plugs with a large `w`. A small weight lets the curve leave a vertex of a turn.

| Row | Value |
|---|---|
| Continuity | C2, so G2. |
| Control | Global, with a banded system. |
| Options | `smoothing` (`λ` as a share of a scale of the board), 0 to 1 on a log scale, default 0.01. `endWeight`, 1 to 1000, default 1000. |
| Cost | `O(k)`. |
| Curvature | The cubic formula on each piece. |
| Offset | Approximate. |
| Clearance | Shrink and test (a smaller `λ` near a box), or larger weights at the vertices near a box. |
| Segments | One `cubic` for each piece. |
| Sources | [Reinsch 1967][reinsch67] |

### Corridor smoothing

Corridor smoothing is a method for each family, not one more family. It finds the free region around a route, then fits the curve in it.

- [Dobkin 1997][dobkin97] find a polygon of free space for each edge, the shortest path in it, and a piecewise Bezier spline. Where the spline leaves the polygon, they split it and fit each part again.
- [Choi 2009][choi09] and [Arslan 2025][arslan25] write the corridor as linear constraints on the control points. The convex hull keeps each Bezier piece in the corridor. The continuity is also a set of linear equations.
- [Yang 2010][yang10] smooth the polyline of a planner with cubic Bezier spirals, for a continuous curvature in closed form.

For this library, the corridor of an orthogonal route is the union of the free rectangles along its legs. The corner triangle and the hull tests are the cheap forms of this method.

## Two comparisons

The numbers of this section come from dense samples of each shape. A corner has 200 000 samples, and an S-curve has 100 000 samples. The curvature at a sample is the turn of its two sample legs divided by their mean length.

### Corners at 90°

Each shape has the tangent length `T = 1`. The values are dimensionless.

| Shape | Length | Peak `κ · T` | `κ · T` at the joint | Energy `T · ∫ κ^2 ds` | Cut at the vertex `/ T` |
|---|---|---|---|---|---|
| Polyline | 2.000 | (a kink) | (a kink) | none | 0 |
| F1 fillet | 1.571 | 1.00 | 1.00 | 1.571 | 0.414 |
| F3 parabola (`rounded`) | 1.623 | 1.41 | 0.50 | 1.667 | 0.354 |
| F4 cubic, `k = 0.5523` | 1.571 | 1.01 | 0.98 | 1.571 | 0.414 |
| F4 cubic, `k = 0.75` | 1.664 | 1.81 | 0.30 | 1.900 | 0.309 |
| F4 cubic, `k = 0.9` | 1.745 | 2.81 | 0.08 | 2.694 | 0.230 |
| F5 superellipse, `n = 3` | 1.686 | 1.78 | 0 | 1.999 | 0.292 |
| F5 superellipse, `n = 4` | 1.754 | 2.52 | 0 | 2.634 | 0.225 |
| F6 clothoid, `q = 0.25` | 1.633 | 1.20 | 0 | 1.732 | 0.352 |
| F6 clothoid, `q = 0.5` | 1.664 | 1.42 | 0 | 1.854 | 0.318 |
| F6 clothoid, `q = 1` | 1.680 | 1.87 | 0 | 1.958 | 0.298 |

The results:

- With the same `T`, a G2 corner has a higher peak curvature than the fillet. The jump at the joint goes, but the peak goes up.
- With the same smallest radius, a G2 corner needs a larger `T`. The clothoid with `q = 0.5` needs `1.42 T`.
- The parabola of `rounded` has a peak 1.41 times the peak of the fillet. Its smallest radius is thus `0.71 T`. `C5` shows this fault of `rounded` today.
- The superellipse and the long cubic cut the corner least. They stay near the vertex and far from a box in the inner side of the turn.
- Among the clothoid corners, `q = 0.5` has the smallest variation of the curvature inside the corner: 7.3, against 9.0 for `q = 0.25` and 8.4 for `q = 1`. Use it as the default.

### S-curves of a merge or a split

Each shape shifts a lane by `d` along the length `l`, with `l = 8 d`. The curvature values are in units of `d / l^2`. The energy is in units of `d^2 / l`.

| Shape | Peak curvature | Jump at each end | Jump at the inflection | Energy | Continuity |
|---|---|---|---|---|---|
| F8 biarc (today) | 3.94 | 3.94 | 7.88 | 0.245 | G1 |
| F4 cubic S, `h = l/3` | 6.00 | 6.00 | 0 | 0.184 | G1 |
| F4 cubic S, `h = l/2` | 5.31 | 2.67 | 0 | 0.261 | G1 |
| F4 quintic S | 5.69 | 0 | 0 | 0.257 | G2 |
| F6 clothoid S | 7.86 | 0 | 0 | 0.326 | G2 |

The results:

- The biarc has the smallest peak, but it has three jumps. The largest jump is at the inflection, where the curvature changes sign at once.
- The quintic S is G2 and has a peak 28% lower than the clothoid S. Its energy is also 21% lower.
- The cubic S with `h = l/2` is one exact cubic segment. It has no jump at the inflection, and its end jumps are 32% lower than those of the biarc.
- The S curves of a merge are not offsets of each other, because each lane shifts by its own distance. Thus exact offsets do not matter here. Fairness and the segments decide.

## Room for the bends of a bundle

HWC-D gives each bend of a wide bundle the room that it needs. A bundle of the width `W` (from its outer lane to its outer lane) bends by `φ`. Its inner lane must keep the radius `r_min`.

- The center line needs the smallest radius `R ≥ r_min + W/2`. This is true for each corner family, because the inner lane has the curvature `κ / (1 - (W/2) κ)`.
- A fillet needs the tangent length `T = R tan(φ/2)` on the center line. A G2 corner needs `c · R tan(φ/2)`. At 90°, `c` is 1.20, 1.42 and 1.87 for the clothoid with `q` of 0.25, 0.5 and 1.
- A leg between two bends needs `T_A + T_B` on the center line. The tangent points of each lane are on the normals of the center line at its own tangent points. Thus each lane uses the same part of the leg.
- The gap next to a box in the inner side of the bend needs the outer half width `W/2` plus the clearance. The corner of the inner lane cuts the vertex by its own cut (the last column of the corner table), so the inner side needs no more room.
- A merge needs the length `l` for its S-curve. Let the S-curve shift the lane by `d` and keep the smallest radius `r_min`. Then `l = sqrt(c_S d r_min)`, with `c_S` the peak curvature from the S-curve table. For the quintic S-curve, `l = sqrt(5.69 d r_min)`. The formula is correct when `l` is much larger than `d`.

## Segments for any renderer

The output of a curve is a list of `CurveSegment` values. Each family maps to them as follows:

| Piece | SVG command | Canvas call | Exact |
|---|---|---|---|
| Line | `L` | `lineTo` | Yes |
| Circular arc | `A r r 0 large sweep x y` | `arc` or `arcTo` | Yes |
| Quadratic Bezier | `Q`, or `C` after degree elevation | `quadraticCurveTo` | Yes |
| Cubic Bezier | `C` | `bezierCurveTo` | Yes |
| Rational quadratic (a conic that is not a circle) | none | none | No, fit cubic segments |
| Quintic and PH curves | none | none | No, fit cubic segments |
| Clothoid and other spirals | none | none | No, fit cubic segments or arcs |
| Offsets of cubic curves | none | none | No, fit cubic segments |

- SVG writes an arc by its end points, its radii and two flags, not by its center ([SVG 2][svg2]). `toSvgPath` derives the flag `large` from the sweep and the flag `sweep` from its sign.
- A cubic segment with the handle ratio of F4 approximates a quarter circle with a radial error of approximately `2.5e-4 r` ([Kuo 2024][kuo24]). Use `arc` segments for circles, because they are exact.
- A fit splits a piece until its error is under the tolerance of the curve. The fit uses the samples of `sampleCurve` to test the error. Thus the measures read the same points as a renderer draws.

## The rankings

The ranking puts the hard rules first: `curve-clear`, `curve-ends`, `curve-g1` and `curve-simple`. Then it compares the continuity, the fairness (`C2`, `C3`, `C4`, `C5`, `C11`), the cost and the exactness of the segments.

### (a) A single route

The routes are mostly orthogonal, with some free-angle polylines.

| Rank | Family | Reason |
|---|---|---|
| 1 (winner) | F7 Bezier spiral corner | G2, local and `O(1)`. The segments are exact cubic segments and arcs. The corner triangle proves the clearance. |
| 2 | F6 Clothoid corner | The best curvature profile: linear, with the least variation at `q = 0.5`. The spirals need a fit to cubic segments. |
| 3 | F1 Circular fillet | The fastest and exact. Only G1, but the baseline of each comparison. |
| 4 | F10 Hobby curve | The best for free-angle polylines with short legs. Global, but `O(k)`. |
| 5 | F9 Centripetal Catmull-Rom | No cusp and no loop in a piece. It swings out of each orthogonal corner. |
| 6 | F11 Cubic B-spline | C2 and a cheap hull test, but it leaves the polyline unless the corners get extra points. |
| 7 | F5 Superellipse corner | G3 and near the vertex, but a high peak curvature. A style for a host app. |
| 8 | F3, F4, F2 | Small changes of the corner shapes of today. |
| 9 | F12, F16, F14, F15, F13 | Global, slow or not exact in SVG. They are references for MEAS2. |

### (b) A lane of a highway

A lane is an offset of the center line of its bundle. Exact offsets keep the lane spacing exact.

| Rank | Family | Reason |
|---|---|---|
| 1 (winner) | F1 and F2 concentric arcs | Exact offsets and exact segments. HWC measured a worst spacing error of 0.8%, against 13.6% for lanes curved alone. |
| 2 | F8 Arc spline | Exact offsets for free-angle center lines. Only G1. |
| 3 | F6 Clothoid center line, with offsets as arcs | G2 lanes. Each offset is a fit within the tolerance ([Levien 2024][levien24]). |
| 4 | F13 PH quintic | Exact rational offsets for measures. The segments need a fit, and the build is heavy. |
| 5 | F7 Bezier spiral corner | G2, but each lane needs a fit of its offset. |
| Last | F9, F10, F11 | Approximate offsets that can have cusps where the radius is small. |

### (c) A merge or a split

A merge or a split is an S that shifts one lane. The S curves of the lanes are not offsets of each other.

| Rank | Family | Reason |
|---|---|---|
| 1 (winner) | F4 Quintic S | G2, with the lowest peak of the G2 shapes: 5.69 against 7.86 for the clothoid S. Four cubic segments keep the error under `0.003 d`. |
| 2 | F4 Cubic S, `h = l/2` | One exact cubic segment. No jump at the inflection, and an end jump 32% lower than the biarc. |
| 3 | F6 Clothoid S | G2, but a higher peak and more energy than the quintic S. |
| 4 | F8 Biarc (today) | Exact arcs and the lowest peak, but three jumps of the curvature. |

## The build order for CURV2

Each step is a strategy of the step `curve`, with its folder, its tests, its row in the benchmark and its declarations in `schema`. The defaults of the types of today do not change.

The targets use the measures of MEAS0. A target with a rule name is that rule of MEAS0. The baseline of each target is `arc` with the same radius on the same fixtures.

| Order | Strategy | Family | Options: name, type, range, default | Measure targets |
|---|---|---|---|---|
| 1 | `smooth` | F7 Bezier spiral corner | `radius`: number, 0 to 48, step 1, default 12. `smoothing`: number, 0 to 1, step 0.05, default 0.6. | `curve-g1` (`C1 ≤ 0.5°`). `C2 < 0.01`. `C5 ≥ radius` at each clear corner. `curve-clear` (`C7` count 0). `curve-simple` (`C9` 0). `C11 = 1` for each corner. |
| 2 | `clothoid` | F6 Clothoid corner | `radius`: number, 0 to 48, step 1, default 12. `spiral`: number, 0 to 1, step 0.05, default 0.5. `tolerance`: number, 0.05 to 1, default 0.25. | `C2 < 0.01`. `C4` lower than `smooth` with the same `radius`. `C5 ≥ radius`. `C7` 0. The error of the segments is under `tolerance`. |
| 3 | The S of `highwayCurves` | F4 S-curves | `jog`: enum, `biarc`, `cubic` or `quintic`, default `biarc`. `jogPieces`: integer, 1 to 8, default 4. | `C2 = 0` at each S for `quintic`, against `3.94 d/l^2` for `biarc`. `C5 ≥ minRadius`. A spacing error no worse than HWC (0.8%). 0 crossings in a bundle. `C7` 0. |
| 4 | `hobby` | F10 Hobby curve | `tension`: number, 0.75 to 4, log scale, default 1. `curl`: number, 0 to 4, step 0.25, default 1. | `curve-ends` (`C10 ≤ 1°` with normals). `C9` 0. `C3` lower than `spline`. `C8` no worse than `spline`. `C7` 0. |
| 5 | `bspline` | F11 B-spline | `degree`: integer, 2 to 3, default 3. `corner`: number, 0 to 48, step 1, default 12. `weight`: number, 0.25 to 4, log scale, default 1. | `C2 < 0.01` for degree 3. `C7` 0 from the hull test with no sample. `C10 = 0°`. `C8` within 10% of `arc`. |
| 6 | `biarc` | F8 Biarc and arc spline | `radius`: number, 0 to 48, step 1, default 12. `joint`: enum, `equal` or `incenter`, default `equal`. | `curve-g1`. `C9` 0. `B9 ≤ 1` for lanes on free-angle routes. Exact lane spacing (error under 0.1%). |
| 7 | `superellipse` | F5 Superellipse corner | `radius`: number, 0 to 48, step 1, default 12. `exponent`: number, 2 to 8, step 0.5, default 4. | `C2 < 0.01`. `C8` lower than `arc`. `C7` 0. The error of the segments is under 0.25. |
| 8 | Options of the types of today | F9, F3 | `spline` gets `alpha`: number, 0 to 1, step 0.05, default 0.5. `rounded` gets `weight`: number, 0.25 to 4, log scale, default 1. | The defaults give the same segments as today. `C9` 0 at `alpha = 0.5`. |

Later items, not in CURV2:

- F13 PH quintic lanes, when a host needs G2 lanes with exact offsets.
- F12, F14, F15 and F16 as references for MEAS2. They give the fairest curve of a small board, and MEAS2 gives the gap of each fast type to it.

## Sources

- <a id="arslan25"></a>arXiv 2510.24972, 2025. [Smooth path planning with safety margins using piece-wise Bezier curves](https://arxiv.org/abs/2510.24972).
- <a id="barsky88"></a>Barsky and DeRose, 1988. [Three characterizations of geometric continuity for parametric curves](https://www2.eecs.berkeley.edu/Pubs/TechRpts/1988/5276.html). UCB/CSD-88-417. The journal form is in IEEE CG&A 9(6) and 10(1).
- <a id="bertolazzi15"></a>Bertolazzi and Frego, 2015. [G1 fitting with clothoids](https://arxiv.org/abs/1305.6644). Mathematical Methods in the Applied Sciences 38(5).
- <a id="bertolazzi17"></a>Bertolazzi and Frego, 2017. [A note on robust biarc computation](https://arxiv.org/abs/1711.00935).
- <a id="borbely13"></a>Borbély and Johnson, 2013. [Elastic splines I: existence](https://arxiv.org/abs/1302.5248).
- <a id="catmull74"></a>Catmull and Rom, 1974. A class of local interpolating splines. In Computer Aided Geometric Design, Academic Press. [Summary of the uniform form](https://splines.readthedocs.io/en/latest/euclidean/catmull-rom-uniform.html).
- <a id="choi09"></a>Choi, Curry and Elkaim, 2009. [Path planning based on Bézier curve for autonomous ground vehicles](https://www.iaeng.org/publication/WCECS2009/WCECS2009_pp668-673.pdf). WCECS 2009.
- <a id="dobkin97"></a>Dobkin, Gansner, Koutsofios and North, 1997. [Implementing a general-purpose edge router](https://doi.org/10.1007/3-540-63938-1_68). GD 1997.
- <a id="elber97"></a>Elber, Lee and Kim, 1997. Comparing offset curve approximation methods. IEEE CG&A 17(3). [Summary in the book of Patrikalakis, Maekawa and Cho](https://web.mit.edu/hyperbook/Patrikalakis-Maekawa-Cho/node222.html).
- <a id="farouki-intro"></a>Farouki. [Introduction to Pythagorean-hodograph curves](https://faculty.engineering.ucdavis.edu/farouki/wp-content/uploads/sites/51/2021/07/Introduction-to-PH-curves.pdf). Lecture notes, UC Davis.
- <a id="farouki95"></a>Farouki and Neff, 1995. [Hermite interpolation by Pythagorean hodograph quintics](https://www.ams.org/mcom/1995-64-212/S0025-5718-1995-1308452-6/). Mathematics of Computation 64.
- <a id="figma18"></a>Figma, 2018. [Desperately seeking squircles](https://www.figma.com/blog/desperately-seeking-squircles/).
- <a id="heald85"></a>Heald, 1985. [Rational approximations for the Fresnel integrals](https://www.ams.org/journals/mcom/1985-44-170/S0025-5718-1985-0777277-6). Mathematics of Computation 44.
- <a id="hobby86"></a>Hobby, 1986. [Smooth, easy to compute interpolating splines](https://doi.org/10.1007/BF02187690). Discrete and Computational Geometry 1.
- <a id="horn83"></a>Horn, 1983. [The curve of least energy](https://dspace.mit.edu/handle/1721.1/5697). ACM TOMS 9.
- <a id="jackowski13"></a>Jackowski, 2013. [Typographers, programmers and mathematicians, or the case of an aesthetically pleasing interpolation](https://tug.org/TUGboat/tb34-2/tb107jackowski.pdf). TUGboat 34(2).
- <a id="joy-chaikin"></a>Joy. [Chaikin's algorithms for curves](https://www.cs.unc.edu/~dm/UNC/COMP258/LECTURES/Chaikins-Algorithm.pdf). Lecture notes, UC Davis.
- <a id="kuo24"></a>arXiv 2407.17675, 2024. [Drawing ellipses and elliptical arcs with piecewise cubic Bézier curve approximations](https://arxiv.org/abs/2407.17675).
- <a id="levien09"></a>Levien, 2009. [From spiral to spline: optimal techniques in interactive curve design](https://www2.eecs.berkeley.edu/Pubs/TechRpts/2009/EECS-2009-162.html). UCB/EECS-2009-162.
- <a id="levien09b"></a>Levien and Séquin, 2009. [Interpolating splines: which is the fairest of them all?](https://levien.com/phd/LevienSequinCAD09_014.pdf) Computer-Aided Design and Applications 6(1).
- <a id="levien22"></a>Levien, 2022. [Parallel curves of cubic Béziers](https://raphlinus.github.io/curves/2022/09/09/parallel-beziers.html).
- <a id="levien24"></a>Levien and Uguray, 2024. [GPU-friendly stroke expansion](https://arxiv.org/abs/2405.00127). HPG 2024.
- <a id="meek92"></a>Meek and Walton, 1992. [Clothoid spline transition spirals](https://doi.org/10.1090/S0025-5718-1992-1134736-8). Mathematics of Computation 59.
- <a id="meek95"></a>Meek and Walton, 1995. Approximating smooth planar curves by arc splines. Journal of Computational and Applied Mathematics 59(2). [Cited with the biarc method in Bertolazzi and Frego 2017](https://arxiv.org/abs/1711.00935).
- <a id="meek04"></a>Meek and Walton, 2004. [An arc spline approximation to a clothoid](https://ftp.math.utah.edu/pub/tex/bib/idx/jcomputapplmath2000/170/1/59_77.html). Journal of Computational and Applied Mathematics 170(1).
- <a id="moreton93"></a>Moreton, 1993. [Minimum curvature variation curves, networks, and surfaces for fair free-form shape design](https://www2.eecs.berkeley.edu/Pubs/TechRpts/1993/5219.html). UCB/CSD-93-732.
- <a id="mumford94"></a>Mumford, 1994. [Elastica and computer vision](https://doi.org/10.1007/978-1-4612-2628-4_31). In Algebraic Geometry and its Applications, Springer.
- <a id="piegl97"></a>Piegl and Tiller, 1997. [The NURBS Book](https://doi.org/10.1007/978-3-642-59223-2). Second edition, Springer.
- <a id="pomax"></a>Pomax. [A primer on Bézier curves](https://pomax.github.io/bezierinfo/).
- <a id="reinsch67"></a>Reinsch, 1967. [Smoothing by spline functions](https://doi.org/10.1007/BF02162161). Numerische Mathematik 10.
- <a id="superellipse"></a>[Superellipse](https://en.wikipedia.org/wiki/Superellipse). Wikipedia.
- <a id="svg2"></a>W3C. [SVG 2, Appendix B: implementation notes](https://www.w3.org/TR/SVG2/implnote.html). The conversion of the arc parameters.
- <a id="tiller84"></a>Tiller and Hanson, 1984. [Offsets of two-dimensional profiles](https://ieeexplore.ieee.org/abstract/document/4055919). IEEE CG&A 4(9).
- <a id="walton96"></a>Walton and Meek, 1996. A planar cubic Bézier spiral. Journal of Computational and Applied Mathematics 72. [Cited with the later work in Walton, Meek and Ali 2003](https://ftp.math.utah.edu/pub/tex/bib/idx/jcomputapplmath2000/157/2/453_476.html).
- <a id="walton03"></a>Walton, Meek and Ali, 2003. [Planar G2 transition curves composed of cubic Bézier spiral segments](https://ftp.math.utah.edu/pub/tex/bib/idx/jcomputapplmath2000/157/2/453_476.html). Journal of Computational and Applied Mathematics 157(2).
- <a id="yan17"></a>Yan, Schiller, Wilensky, Carr and Schaefer, 2017. [κ-curves: interpolation at local maximum curvature](https://people.engr.tamu.edu/schaefer/research/kcurves.pdf). ACM TOG 36(4), SIGGRAPH 2017.
- <a id="yang10"></a>Yang and Sukkarieh, 2010. [An analytical continuous-curvature path-smoothing algorithm](https://doi.org/10.1109/TRO.2010.2042990). IEEE Transactions on Robotics 26(3).
- <a id="yuksel11"></a>Yuksel, Schaefer and Keyser, 2011. [Parameterization and applications of Catmull-Rom curves](https://cemyuksel.com/research/catmullrom_param/). Computer-Aided Design 43(7).

[arslan25]: #arslan25
[barsky88]: #barsky88
[bertolazzi15]: #bertolazzi15
[bertolazzi17]: #bertolazzi17
[borbely13]: #borbely13
[catmull74]: #catmull74
[choi09]: #choi09
[dobkin97]: #dobkin97
[elber97]: #elber97
[farouki-intro]: #farouki-intro
[farouki95]: #farouki95
[figma18]: #figma18
[heald85]: #heald85
[hobby86]: #hobby86
[horn83]: #horn83
[jackowski13]: #jackowski13
[joy-chaikin]: #joy-chaikin
[kuo24]: #kuo24
[levien09]: #levien09
[levien09b]: #levien09b
[levien22]: #levien22
[levien24]: #levien24
[meek92]: #meek92
[meek95]: #meek95
[meek04]: #meek04
[moreton93]: #moreton93
[mumford94]: #mumford94
[piegl97]: #piegl97
[pomax]: #pomax
[reinsch67]: #reinsch67
[superellipse]: #superellipse
[svg2]: #svg2
[tiller84]: #tiller84
[walton96]: #walton96
[walton03]: #walton03
[yan17]: #yan17
[yang10]: #yang10
[yuksel11]: #yuksel11
