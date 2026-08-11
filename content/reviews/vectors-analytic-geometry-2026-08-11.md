---
id: vectors-analytic-geometry-2026-08-11
verifiedAt: "2026-08-11"
methods:
  - source-selector-match
  - independent-recalculation
  - machine-check-roundtrip
  - rendered-math-validation
topics:
  - slug: vektori-analitika
    tasks: [vek-001, vek-002, vek-003]
---

# Vectors and analytic geometry verification

The complete slot 6 pilot pack was checked against the independently authored
statement and solution workbooks pinned in `sources.json`. The statement and
solution SHA-256 values were respectively
`77c09f9b0d1c0b92be4f66f8f0aa37704df7036333ef3118abce069c56f194f5` and
`a54bd5cccf8099b5a1c478ee7581c42b606648a90f3c51a1a046b2ffbf0ed2cc`.
Selectors `3a`, `2`, and `4` resolve to the published task boundaries; `3a`
contains only the selected parallelogram subtask.

Every result was recalculated independently of the prose solutions:

- `vek-001`: $d_1\times d_2=(6,6,-6)$ has norm $6\sqrt3$. The diagonal
  formula contributes the required factor $1/2$, so the area is $3\sqrt3$.
- `vek-002`: the independently formed vectors are $(-2,1,1)$ and
  $(-1,-1,2)$. Their dot product is $3$, both squared norms are $6$, and their
  cross product is $(3,3,3)$, giving the stated $60^\circ$ angle and
  $3\sqrt3/2$ area. Coordinate averaging gives the centroid $(0,1,2)$.
- `vek-003` a): the given lengths and angle give $p\cdot q=1$, hence
  $|p+q|^2=5$ and $(p+tq)\cdot q=1+2t=0$, so $t=-1/2$.
- `vek-003` b) and v): the independent parameter equations reduce to
  $2\alpha-4=0$ and $4-4\alpha=0$, with the unique values $2$ and $1$.

The production checker accepted equivalent radical and fractional forms plus
spaced coordinate tuples, while rejecting a missing area factor and a wrong
orthogonality sign. Statements, hints, solutions, and the three five-point
rubrics rendered without KaTeX errors or undefined commands. No original FTN
paper or copyrighted task manual was used or added during this review.
