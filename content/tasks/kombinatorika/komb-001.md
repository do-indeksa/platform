---
id: komb-001
slot: 10
topic: kombinatorika
difficulty: 3
source: 'Do indeksa (autorski)'
origin: 'FTN_P1_Tematski_Zadaci_sr.tex, slot 10, zadatak 2'
status: verified
answer: 'a) $1771$; b) $969$; v) $455$'
check:
  - label: 'a)'
    kind: value
    expected: '1771'
  - label: 'b)'
    kind: value
    expected: '969'
  - label: 'v)'
    kind: value
    expected: '455'
rubric:
  - id: nonnegative-solutions
    points: 1
    text: 'Za nenegativna rešenja pravilno je primenjena formula zvezda i pregrada $\binom{23}{3}=1771$.'
  - id: positive-solutions
    points: 2
    text: 'Smenom $x_i=y_i+1$ uslov je sveden na zbir $16$, pa je broj rešenja $\binom{19}{3}=969$.'
  - id: lower-bound-two
    points: 2
    text: 'Smenom $x_i=y_i+2$ uslov je sveden na zbir $12$, pa je broj rešenja $\binom{15}{3}=455$.'
---

## Zadatak

Naći broj celobrojnih rešenja jednačine

$$x_1+x_2+x_3+x_4=20$$

pod uslovima:

**a)** $x_i\ge 0$ za sve $i$;

**b)** $x_i\ge 1$ za sve $i$;

**v)** $x_i\ge 2$ za sve $i$.

## Nagoveštaj 1

Ovo je model „zvezde i pregrade”: raspoređuješ $20$ jedinica u četiri promenljive. Slučajeve b) i v) svedi smenom na slučaj nenegativnih rešenja iz a).

## Nagoveštaj 2

Broj nenegativnih celobrojnih rešenja jednačine $y_1+\cdots+y_4=N$ jednak je $\dbinom{N+3}{3}$. Za b) uvedi smenu $x_i=y_i+1$, $y_i\ge 0$, koja daje $y_1+\cdots+y_4=16$; za v) smena $x_i=y_i+2$, $y_i\ge 0$, daje $y_1+\cdots+y_4=12$.

## Rešenje

Broj nenegativnih celobrojnih rešenja jednačine $y_1+\cdots+y_4=N$ („zvezde i pregrade”) jednak je $\dbinom{N+3}{3}$.

**a)** Odmah $\dbinom{23}{3}=\dfrac{23\cdot 22\cdot 21}{6}=1771$.

**b)** Smena $x_i=y_i+1$, $y_i\ge 0$, daje $y_1+\cdots+y_4=16$, odakle $\dbinom{19}{3}=\dfrac{19\cdot 18\cdot 17}{6}=969$.

**v)** Smena $x_i=y_i+2$, $y_i\ge 0$, daje $y_1+\cdots+y_4=12$, odakle $\dbinom{15}{3}=\dfrac{15\cdot 14\cdot 13}{6}=455$.
