---
id: plan-003
slot: 7
topic: planimetrija
difficulty: 3
source: 'Do indeksa (autorski)'
origin: 'FTN_P1_Tematski_Zadaci_sr.tex, slot 7, zadatak 4'
status: verified
answer: 'a) stranice $6,\ 10,\ 14$, $S=15\sqrt{3}$; b) $r=\sqrt{3}$, $R=\frac{14\sqrt{3}}{3}$'
check:
  - label: 'a) stranice'
    kind: values
    expected: '6, 10, 14'
  - label: 'a) S'
    kind: value
    expected: '15sqrt(3)'
  - label: 'b) r'
    kind: value
    expected: 'sqrt(3)'
  - label: 'b) R'
    kind: value
    expected: '14sqrt(3)/3'
rubric:
  - id: progression-and-cosine-law
    points: 2
    text: 'Stranice su zapisane kao $10-d$, $10$, $10+d$ i kosinusnom teoremom za ugao $120^\circ$ dobijeno je $d=4$.'
  - id: sides-and-area
    points: 1
    text: 'Navedene su stranice $6,10,14$ i površina $S=15\sqrt3$.'
  - id: circle-radii
    points: 2
    text: 'Iz $r=S/s$ i sinusne teoreme pravilno su dobijeni $r=\sqrt3$ i $R=14\sqrt3/3$.'
---

## Zadatak

Stranice trougla čine aritmetičku progresiju, njegov obim je $30$, a jedan od uglova je $120^\circ$.

**a)** Naći stranice trougla i njegovu površinu.

**b)** Naći poluprečnike upisane i opisane kružnice.

## Nagoveštaj 1

Stranice u aritmetičkoj progresiji imaju srednju jednaku trećini obima, a ugao od $120^\circ$ leži naspram najveće stranice — razliku progresije daje kosinusna teorema. Za b) poveži upisanu kružnicu sa površinom i poluobimom, a opisanu nađi sinusnom teoremom.

## Nagoveštaj 2

Neka su stranice $x-d,\ x,\ x+d$; iz obima je $3x=30$. Kosinusna teorema za ugao naspram stranice $x+d$, sa $\cos 120^\circ=-\tfrac12$, daje jednačinu po $d$; površinu zatim računaš preko dve stranice i sinusa zahvaćenog ugla. Za b): poluobim $s=15$, pa $r=\dfrac{S}{s}$, a $R$ dobijaš iz sinusne teoreme za stranicu naspram ugla od $120^\circ$.

## Rešenje

**a)** Neka su stranice $x-d,\ x,\ x+d$. Zbir $3x=30$, znači $x=10$. Ugao $120^\circ$ leži naspram najveće stranice $x+d$. Po kosinusnoj teoremi sa $\cos 120^\circ=-\tfrac12$:

$$(10+d)^2=(10-d)^2+10^2-2(10-d)\cdot 10\cdot\left(-\tfrac12\right),$$

odakle $40d=200-10d$, $d=4$. Stranice su $6,\ 10,\ 14$ (provera: $14^2=6^2+10^2+6\cdot 10=196$). Površina

$$S=\frac12\cdot 6\cdot 10\cdot\sin 120^\circ=30\cdot\frac{\sqrt{3}}{2}=15\sqrt{3}.$$

**b)** Poluobim $s=15$. Tada $r=\dfrac{S}{s}=\dfrac{15\sqrt{3}}{15}=\sqrt{3}$, a po sinusnoj teoremi

$$R=\frac{14}{2\sin 120^\circ}=\frac{14}{\sqrt{3}}=\frac{14\sqrt{3}}{3}.$$
