---
id: function-analysis-2026-08-11
verifiedAt: "2026-08-11"
methods:
  - source-selector-match
  - independent-recalculation
  - machine-check-roundtrip
  - rendered-math-validation
topics:
  - slug: analiza-funkcije
    tasks: [fun-001, fun-002, fun-003]
---

# Function analysis verification

The complete slot 9 pilot pack was checked against the independently authored
statement and solution workbooks pinned in `sources.json`. The statement and
solution SHA-256 values were respectively
`77c09f9b0d1c0b92be4f66f8f0aa37704df7036333ef3118abce069c56f194f5` and
`a54bd5cccf8099b5a1c478ee7581c42b606648a90f3c51a1a046b2ffbf0ed2cc`.
Selectors `1`, `4`, and `6` resolve to the published task boundaries for
`fun-001`, `fun-002`, and `fun-003`.

Every result was recalculated independently of the prose solutions:

- `fun-001`: polynomial division gives $x+2+1/(x-2)$, proving the stated
  domain and asymptotes. The derivative factors as
  $(x-1)(x-3)/(x-2)^2$; complete sign intervals and second derivatives $-2$
  and $2$ confirm a local maximum $f(1)=2$ and local minimum $f(3)=6$.
  Exact integration gives $11/2+\ln2$.
- `fun-002`: division gives $x-1+3/(x+1)$ and the corresponding asymptotes.
  At $x=0$, the point is $(0,2)$ and the derivative is $-2$, so tangent and
  normal slopes are $-2$ and $1/2$. Leading terms give
  $\lim_{x\to+\infty}f(x)/x=1$.
- `fun-003`: independent symbolic integration gives, in order,
  $(e^2+1)/4$, $(2\sqrt2-1)/3$, $1/2$, and $1$. Direct differentiation of
  the intermediate antiderivatives reproduces every integrand.

The first source solution calls the two stationary values a maximum and a
minimum without qualification. Since the function is unbounded around its
vertical asymptote, the learner-facing card now correctly labels them local
extrema without changing the archived source or any numeric result.

The production checker accepted reordered linear expressions and equivalent
fractional, logarithmic, exponential, and radical forms while rejecting a
missing logarithmic term and an incorrect normal slope. Statements, hints,
solutions, and the three five-point rubrics rendered without KaTeX errors or
undefined commands. No original FTN paper or copyrighted task manual was used
or added during this review.
