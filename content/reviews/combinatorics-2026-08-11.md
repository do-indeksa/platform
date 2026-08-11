---
id: combinatorics-2026-08-11
verifiedAt: "2026-08-11"
methods:
  - source-selector-match
  - independent-recalculation
  - machine-check-roundtrip
  - rendered-math-validation
topics:
  - slug: kombinatorika
    tasks: [komb-001, komb-002, komb-003]
---

# Combinatorics verification

The complete slot 10 pilot pack was checked against the independently authored
statement and solution workbooks pinned in `sources.json`. The statement and
solution SHA-256 values were respectively
`77c09f9b0d1c0b92be4f66f8f0aa37704df7036333ef3118abce069c56f194f5` and
`a54bd5cccf8099b5a1c478ee7581c42b606648a90f3c51a1a046b2ffbf0ed2cc`.
Selectors `2`, `3`, and `6` resolve to the published task boundaries for
`komb-001`, `komb-002`, and `komb-003`.

Every result was recalculated independently of the prose solutions and checked
against exhaustive finite enumeration:

- `komb-001`: stars and bars gives $\binom{23}{3}=1771$. Translating each
  variable by one and two gives $\binom{19}{3}=969$ and
  $\binom{15}{3}=455$. Enumerating all bounded integer quadruples reproduces
  all three counts.
- `komb-002`: direct enumeration of four-permutations from six digits, with a
  nonzero leading digit, gives $300$ total values, $108$ divisible by five,
  and $156$ even. These match the separate last-digit case calculations.
- `komb-003`: exhaustive four-person subsets give
  $\binom{12}{4}-\binom{7}{4}=460$. Positive ordered triples summing to six give
  ten compositions and exactly the three sorted partitions $(4,1,1)$,
  $(3,2,1)$, and $(2,2,2)$. Enumerating ordered distinct letter pairs and the
  constrained three-digit suffix gives $27000$ codes.

The third card now says "positive natural summands" explicitly. This removes
the convention-dependent ambiguity over whether zero belongs to the natural
numbers while preserving the source's intended positive-solution model and
all published results.

The production checker accepted equivalent product, sum, and fractional forms
while rejecting off-by-one and wrong-parity counts. Statements, hints,
solutions, and the three five-point rubrics rendered without KaTeX errors or
undefined commands. No original FTN paper or copyrighted task manual was used
or added during this review.
