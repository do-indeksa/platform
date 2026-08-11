---
id: trig-001
slot: 5
topic: trigonometrija
difficulty: 2
source: 'Do indeksa (autorski)'
origin: 'FTN_P1_Tematski_Zadaci_sr.tex, slot 5, zadatak 4'
status: verified
answer: 'na $[0,2\pi)$: $x\in\left\{\frac{\pi}{2},\ \frac{5\pi}{6}\right\}$; u $\left(\frac{2\pi}{3},2\pi\right)$: samo $x=\frac{5\pi}{6}$'
check:
  - label: 'na [0,2pi)'
    kind: values
    expected: 'pi/2, 5pi/6'
  - label: 'u (2pi/3,2pi)'
    kind: value
    expected: '5pi/6'
rubric:
  - id: sine-families
    points: 2
    text: 'Jednačina je svedena na $\sin(x-\pi/6)=\sqrt{3}/2$ i navedene su obe opšte serije rešenja.'
  - id: principal-interval
    points: 2
    text: 'Iz opštih serija su na intervalu $[0,2\pi)$ izdvojena tačno rešenja $x=\pi/2$ i $x=5\pi/6$.'
  - id: restricted-interval
    points: 1
    text: 'Za uži otvoreni interval proverene su granice i zadržano je samo rešenje $x=5\pi/6$.'
---

## Zadatak

Naći sva rešenja jednačine

$$2\sin\!\left(x-\frac{\pi}{6}\right)=\sqrt{3},$$

koja pripadaju intervalu $[0,\,2\pi)$, i posebno ona od njih koja leže u $\left(\dfrac{2\pi}{3},\,2\pi\right)$.

## Nagoveštaj 1

Podeli jednačinu sa $2$ da dobiješ tabličnu vrednost sinusa. Sinus istu vrednost uzima za dva ugla, pa zapiši obe serije rešenja, a zatim odaberi one korene koji upadaju u tražene intervale.

## Nagoveštaj 2

Iz $\sin\!\left(x-\dfrac{\pi}{6}\right)=\dfrac{\sqrt{3}}{2}$ dobijaš dve serije: $x-\frac{\pi}{6}=\frac{\pi}{3}+2k\pi$ ili $x-\frac{\pi}{6}=\frac{2\pi}{3}+2k\pi$. Prebaci $\dfrac{\pi}{6}$ na desnu stranu, pa proveri koje vrednosti pripadaju svakom od dva intervala.

## Rešenje

Iz $\sin\!\left(x-\dfrac{\pi}{6}\right)=\dfrac{\sqrt{3}}{2}$ dobijamo dve serije:

$$x-\frac{\pi}{6}=\frac{\pi}{3}+2k\pi\quad\text{ili}\quad x-\frac{\pi}{6}=\frac{2\pi}{3}+2k\pi,$$

to jest $x=\dfrac{\pi}{2}+2k\pi$ ili $x=\dfrac{5\pi}{6}+2k\pi$. Na $[0,2\pi)$ ostaju $x=\dfrac{\pi}{2}$ i $x=\dfrac{5\pi}{6}$.

Odabir korena koji pripadaju $\left(\dfrac{2\pi}{3},2\pi\right)$: $\dfrac{\pi}{2}\approx 1{,}57<\dfrac{2\pi}{3}\approx 2{,}09$ — ne pripada, a $\dfrac{5\pi}{6}\approx 2{,}62$ — pripada.
