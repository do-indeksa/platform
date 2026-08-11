---
id: trigonometry-2026-08-11
verifiedAt: "2026-08-11"
methods:
  - source-selector-match
  - independent-recalculation
  - machine-check-roundtrip
  - rendered-math-validation
topics:
  - slug: trigonometrija
    tasks: [trig-001, trig-002, trig-003]
---

# Trigonometry verification

The complete slot 5 pilot pack was checked against the independently authored
statement and solution workbooks pinned in `sources.json`. The statement and
solution SHA-256 values were respectively
`77c09f9b0d1c0b92be4f66f8f0aa37704df7036333ef3118abce069c56f194f5` and
`a54bd5cccf8099b5a1c478ee7581c42b606648a90f3c51a1a046b2ffbf0ed2cc`.
Selectors `1`, `4`, and `5` resolve to the published task boundaries without
borrowing an adjacent subtask.

The equations and sign sets were recalculated independently of the prose
solutions:

- `trig-001`: the reference-angle equation gives the complete families
  $x=\pi/2+2k\pi$ and $x=5\pi/6+2k\pi$. Their intersections with
  $[0,2\pi)$ are exactly $\{\pi/2,5\pi/6\}$, while the open subinterval keeps
  only $5\pi/6$; direct substitution gives zero residual for both roots.
- `trig-002` a): the double-angle identity reduces the equation to
  $(2\cos x+1)(\cos x+1)=0$, yielding exactly
  $\{2\pi/3,\pi,4\pi/3\}$ on the stated half-open interval.
- `trig-002` b): the sum-to-product identity gives
  $\cos 2x(2\cos x-1)=0$, whose intersection with $(0,\pi)$ is exactly
  $\{\pi/4,\pi/3,3\pi/4\}$; all three residuals are zero.
- `trig-003`: the identity $f(x)=2\cos x(1-\cos x)$ gives the three stated
  zeros. Since $1-\cos x$ is positive away from zero, sample values in every
  component confirm the two positive intervals and the two negative intervals.
  The endpoint $-\pi$ is excluded and $\pi$ is included with $f(\pi)=-4$.

The production checker accepted reordered exact angle sets, Unicode $\pi$,
and equivalent union notation while rejecting a root outside the requested
subinterval and an interval with the wrong endpoint. Statements, hints,
solutions, and the three five-point rubrics rendered without KaTeX errors or
undefined commands. No original FTN paper or copyrighted task manual was used
or added during this review.
