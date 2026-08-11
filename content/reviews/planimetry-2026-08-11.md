---
id: planimetry-2026-08-11
verifiedAt: "2026-08-11"
methods:
  - source-selector-match
  - independent-recalculation
  - machine-check-roundtrip
  - rendered-math-validation
topics:
  - slug: planimetrija
    tasks: [plan-001, plan-002, plan-003]
---

# Planimetry verification

The complete slot 7 pilot pack was checked against the independently authored
statement and solution workbooks pinned in `sources.json`. The statement and
solution SHA-256 values were respectively
`77c09f9b0d1c0b92be4f66f8f0aa37704df7036333ef3118abce069c56f194f5` and
`a54bd5cccf8099b5a1c478ee7581c42b606648a90f3c51a1a046b2ffbf0ed2cc`.
Selectors `3a`, `2`, and `4` resolve to the published task boundaries; `3a`
contains only the selected rhombus subtask.

Every result was recalculated independently of the prose solutions:

- `plan-001`: the positive system $d_1-d_2=14$ and
  $d_1^2+d_2^2=4\cdot13^2$ has the unique solution $(24,10)$. It gives area
  $120$, height $120/13$, and inradius $60/13$.
- `plan-002` a): tangential-quadrilateral equality gives leg $13$; the
  half-difference of the bases is $5$, so the positive height is $12$, the
  inradius is $6$, and the area is $156$.
- `plan-002` b): centered coordinates turn perpendicular diagonals into
  $-100+h^2=0$. The positive height is $10$ and the area is $100$.
- `plan-003`: the perimeter fixes the middle progression term at $10$.
  The cosine-law equation has the unique root $d=4$, and $6+10>14$ confirms a
  nondegenerate triangle. Exact area and circle formulas give
  $15\sqrt3$, $r=\sqrt3$, and $R=14\sqrt3/3$.

The production checker accepted reordered sides and equivalent radical,
fractional, and product forms while rejecting an incorrect area factor and a
wrong side set. Statements, hints, solutions, and the three five-point rubrics
rendered without KaTeX errors or undefined commands. No original FTN paper or
copyrighted task manual was used or added during this review.
