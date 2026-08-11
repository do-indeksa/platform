---
id: stereometry-2026-08-11
verifiedAt: "2026-08-11"
methods:
  - source-selector-match
  - independent-recalculation
  - machine-check-roundtrip
  - rendered-math-validation
topics:
  - slug: stereometrija
    tasks: [ster-001, ster-002, ster-003]
---

# Stereometry verification

The complete slot 8 pilot pack was checked against the independently authored
statement and solution workbooks pinned in `sources.json`. The statement and
solution SHA-256 values were respectively
`77c09f9b0d1c0b92be4f66f8f0aa37704df7036333ef3118abce069c56f194f5` and
`a54bd5cccf8099b5a1c478ee7581c42b606648a90f3c51a1a046b2ffbf0ed2cc`.
Selectors `7`, `1`, and `2` resolve to the published task boundaries for
`ster-001`, `ster-002`, and `ster-003`.

Every result was recalculated independently of the prose solutions:

- `ster-001`: positivity removes the degenerate root from $6a^2=a^3$, leaving
  $a=6$. Both the coordinate plane $x+y+z=a$ and the tetrahedron
  volume-to-base-area formula give distance $a/\sqrt3=2\sqrt3$. Radii $a/2$
  and $a\sqrt3/2$ give sphere-volume ratio $\sqrt3/9$.
- `ster-002`: the progression and axial Pythagorean equations have the unique
  positive solution $(H,s)=(4,5)$. Exact cone measures are $12\pi$ and
  $24\pi$; the axial triangle has inradius $12/8=3/2$, yielding sphere-to-cone
  volume ratio $3/8$.
- `ster-003`: similar horizontal sections give
  $b=a(H-b)/H=aH/(a+H)$. At $(a,H)=(6,12)$ this gives $b=4$, cube volume $64$,
  surface area $96$, pyramid volume $144$, and ratio $4/9$.

The source statement adapted by `ster-003` leaves the cube's horizontal rotation implicit. A
45-degree rotation would instead satisfy $b\sqrt2=6(12-b)/12$ and produce
$b\approx3.134$, so the learner-facing card now states the intended
parallel-edge orientation explicitly. This clarification makes the geometric
model unique without changing the archived source or its intended solution.

The production checker accepted equivalent radical, fractional, product, and
power forms while rejecting incorrect distance and volume-ratio values.
Statements, hints, solutions, and the three five-point rubrics rendered without
KaTeX errors or undefined commands. No original FTN paper or copyrighted task
manual was used or added during this review.
