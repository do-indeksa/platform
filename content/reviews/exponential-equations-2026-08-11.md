---
id: exponential-equations-2026-08-11
verifiedAt: "2026-08-11"
methods:
  - source-selector-match
  - independent-recalculation
  - machine-check-roundtrip
  - rendered-math-validation
topics:
  - slug: eksponencijalne
    tasks: [eks-001, eks-002, eks-003]
---

# Exponential equations verification

The complete slot 4 pilot pack was checked against the independently authored
statement and solution workbooks pinned in `sources.json`. The statement and
solution SHA-256 values were respectively
`77c09f9b0d1c0b92be4f66f8f0aa37704df7036333ef3118abce069c56f194f5` and
`a54bd5cccf8099b5a1c478ee7581c42b606648a90f3c51a1a046b2ffbf0ed2cc`.
Selectors `1a`, `2`, and `3` resolve to the published task boundaries without
borrowing an adjacent subtask.

The solution sets were recalculated independently of the prose solutions:

- `eks-001`: for $t=2^x>0$, the polynomial factors as
  $(t-4)(t+1)$. Only $t=4$ is admissible, so the unique real solution is
  $x=2$; direct substitution gives zero residual.
- `eks-002`: dividing by $4^x>0$ makes $t=(3/2)^x$ a positive bijective
  substitution. The polynomials factor as $(t-1)(4t-9)$ and
  $(2t-3)(3t-2)$, which map exactly to ${0,2}$ and ${-1,1}$.
- `eks-003` a): $y=|x|\ge0$ reduces the equation to
  $(y-3)(y+1)=0$. The only admissible magnitude is $3$, yielding both
  $x=-3$ and $x=3$, each with zero residual.
- `eks-003` b): monotonicity of base $2$ gives
  $|x^2-2x|\le3$. The lower quadratic bound is always true and the upper
  bound factors as $(x-3)(x+1)\le0$, so the exact set is $[-1,3]$.
  Both endpoints satisfy equality; $x=-2$ and $x=4$ were checked as outside.

The production checker accepted independent equivalent forms `4/2`,
`x1=0, x2=2`, `1;-1`, `x=+-3`, and `-1 <= x <= 3`. Statements, hints,
solutions, and the three five-point rubrics rendered without KaTeX errors or
undefined commands. No original FTN paper or copyrighted task manual was used
or added during this review.
