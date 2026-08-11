---
id: trig-002
slot: 5
topic: trigonometrija
difficulty: 3
source: 'Do indeksa (autorski)'
origin: 'FTN_P1_Tematski_Zadaci_sr.tex, slot 5, zadatak 1'
status: verified
answer: 'a) $x\in\left\{\frac{2\pi}{3},\ \pi,\ \frac{4\pi}{3}\right\}$; b) $x\in\left\{\frac{\pi}{4},\ \frac{\pi}{3},\ \frac{3\pi}{4}\right\}$'
check:
  - label: 'a)'
    kind: values
    expected: '2pi/3, pi, 4pi/3'
  - label: 'b)'
    kind: values
    expected: 'pi/4, pi/3, 3pi/4'
rubric:
  - id: double-angle-reduction
    points: 2
    text: 'U delu a) identitet $\cos 2x=2\cos^2x-1$ daje kvadratnu jednačinu sa vrednostima $\cos x=-1/2$ i $\cos x=-1$.'
  - id: product-reduction
    points: 2
    text: 'U delu b) zbir kosinusa je pravilno pretvoren u proizvod $\cos 2x\,(2\cos x-1)=0$ i rešena su oba činioca.'
  - id: interval-filter
    points: 1
    text: 'Sve dobijene serije su presečene sa odgovarajućim intervalima i navedena su sva rešenja bez suvišnih tačaka.'
---

## Zadatak

Rešiti jednačine na naznačenim intervalima.

**a)** $\cos 2x+3\cos x+2=0$ na intervalu $[0,\,2\pi)$;

**b)** $\cos 3x+\cos x=\cos 2x$ na intervalu $(0,\,\pi)$.

## Nagoveštaj 1

Pod a) izrazi $\cos 2x$ preko $\cos x$ — jednačina postaje kvadratna po $\cos x$. Pod b) zbir kosinusa na levoj strani pretvori u proizvod, pa rastavi jednačinu na činioce.

## Nagoveštaj 2

Pod a) zamena $\cos 2x=2\cos^2 x-1$ daje $2\cos^2 x+3\cos x+1=0$ — uvedi $t=\cos x$ i reši kvadratnu jednačinu. Pod b) iz $\cos 3x+\cos x=2\cos 2x\cos x$ jednačina poprima oblik $\cos 2x\,(2\cos x-1)=0$, pa svaki činilac izjednači sa nulom.

## Rešenje

**a)** Zamenimo $\cos 2x=2\cos^2 x-1$:

$$2\cos^2 x+3\cos x+1=0.$$

Neka je $t=\cos x$: $2t^2+3t+1=0$, $D=1$, $t=-\dfrac12$ ili $t=-1$. Za $\cos x=-\dfrac12$ na $[0,2\pi)$: $x=\dfrac{2\pi}{3},\ \dfrac{4\pi}{3}$. Za $\cos x=-1$: $x=\pi$.

**b)** Pošto je $\cos 3x+\cos x=2\cos 2x\cos x$, jednačina poprima oblik

$$\cos 2x\,(2\cos x-1)=0.$$

Iz $\cos 2x=0$: $x=\dfrac{\pi}{4}+\dfrac{k\pi}{2}$, na $(0,\pi)$ to su $\dfrac{\pi}{4}$ i $\dfrac{3\pi}{4}$. Iz $\cos x=\dfrac12$ na $(0,\pi)$: $x=\dfrac{\pi}{3}$.
