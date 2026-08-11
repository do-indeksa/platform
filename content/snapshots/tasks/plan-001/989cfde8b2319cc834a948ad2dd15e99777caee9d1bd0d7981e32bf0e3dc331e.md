---
id: plan-001
slot: 7
topic: planimetrija
difficulty: 3
source: 'Do indeksa (autorski)'
origin: 'FTN_P1_Tematski_Zadaci_sr.tex, slot 7, zadatak 3a'
status: verified
answer: '$d_1=24$, $d_2=10$, $P=120$, $r=\frac{60}{13}$'
check:
  - label: 'P'
    kind: value
    expected: '120'
  - label: 'r'
    kind: value
    expected: '60/13'
rubric:
  - id: diagonal-system
    points: 2
    text: 'Iskorišćeni su uslovi $d_1-d_2=14$ i $d_1^2+d_2^2=4\cdot13^2$ za dijagonale romba.'
  - id: diagonals-and-area
    points: 2
    text: 'Sistem je rešen sa pozitivnim dijagonalama $d_1=24$, $d_2=10$ i površinom $P=d_1d_2/2=120$.'
  - id: inradius
    points: 1
    text: 'Iz visine $h=P/13$ i jednakosti $2r=h$ dobijeno je $r=60/13$.'
---

## Zadatak

Razlika dijagonala romba je $14$, a stranica je $13$. Naći dijagonale, površinu i poluprečnik upisane kružnice.

## Nagoveštaj 1

Dijagonale romba su normalne i polove se, pa Pitagorina teorema na polovinama dijagonala vezuje $d_1$ i $d_2$ sa stranicom. Površina se izražava preko dijagonala, a upisana kružnica ima prečnik jednak visini romba.

## Nagoveštaj 2

Kreni od $d_1^2+d_2^2=4a^2=4\cdot 13^2=676$, a uslov $d_1-d_2=14$ kvadriraj: $d_1^2-2d_1d_2+d_2^2=196$ — oduzimanjem dobijaš $d_1d_2$. Zatim iz $(d_1+d_2)^2=d_1^2+d_2^2+2d_1d_2$ nalaziš zbir dijagonala, pa rešavaš sistem. Za poluprečnik iskoristi $h=\dfrac{P}{a}$ i $r=\dfrac{h}{2}$.

## Rešenje

Dijagonale romba su normalne i polove se, pa je $d_1^2+d_2^2=4a^2=4\cdot 13^2=676$.

Iz $d_1-d_2=14$ kvadriranjem: $d_1^2-2d_1d_2+d_2^2=196$, odakle $d_1d_2=\dfrac{676-196}{2}=240$. Tada

$$(d_1+d_2)^2=d_1^2+d_2^2+2d_1d_2=676+480=1156\;\Rightarrow\;d_1+d_2=34.$$

Iz sistema $d_1-d_2=14$, $d_1+d_2=34$: $d_1=24$, $d_2=10$.

Površina $P=\dfrac{d_1d_2}{2}=120$. Visina romba $h=\dfrac{P}{a}=\dfrac{120}{13}$; kružnica upisana u romb ima prečnik jednak visini, pa je $r=\dfrac{h}{2}=\dfrac{60}{13}$.
