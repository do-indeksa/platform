---
id: core-topics-2026-08-11
verifiedAt: "2026-08-11"
methods:
  - source-selector-match
  - independent-recalculation
  - machine-check-roundtrip
  - rendered-math-validation
topics:
  - slug: kompleksni-brojevi
    tasks: [kb-001, kb-002, kb-003]
  - slug: kvadratna-jednacina
    tasks: [kv-001, kv-002, kv-003]
  - slug: logaritmi
    tasks: [log-001, log-002, log-003]
---

# Core topics verification

The first three P1 topic packs were checked task by task against the pinned
authored statement and solution workbooks. The calculations below were repeated
independently of the prose solution; exact values were then passed through the
same answer checker used by the product.

- `kb-001`: $\lvert z\rvert^2=2t^2-4t+20$ has its minimum at $t=1$;
  then $\lvert z\rvert^2=18$ and $z=3-3i$.
- `kb-002`: direct complex division gives $(5+12i)/13$, $(3+2i)/13$,
  and $w=2$.
- `kb-003`: quadrants and quotient rules give moduli $6$, $\sqrt2/2$ and
  arguments $2\pi/3$, $5\pi/12$.
- `kv-001`: $x_1=3x_2$ and $x_1x_2=12$ give $x_2=\pm2$ and therefore
  $m=\pm8$.
- `kv-002`: the three reduced equations have the only real admissible results
  $m=5$, $m=4$, and $m=6$.
- `kv-003`: discriminants are $(m-4)^2$ and $-16(m-2)$; Vieta signs give
  $(-2,2)$ and $(-\infty,-2)$.
- `log-001`: with $t=\log_2x$, $(2t-1)(t-2)=0$, so $x=\sqrt2$ or $x=4$.
- `log-002`: monotonicity of base $1/3$ reduces the inequality to
  $0<x^2-2x<3$, with the stated open intervals.
- `log-003`: domain checks leave $x=3$ in part a; in part b, $u=2^x>1$
  reduces the equation to $(u-5)(u+1)=0$.

No original FTN exam paper or task manual was used or added during this review.
