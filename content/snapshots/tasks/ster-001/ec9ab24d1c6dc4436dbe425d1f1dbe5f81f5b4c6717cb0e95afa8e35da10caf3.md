---
id: ster-001
slot: 8
topic: stereometrija
difficulty: 4
source: 'Do indeksa (autorski)'
origin: 'FTN_P1_Tematski_Zadaci_sr.tex, slot 8, zadatak 7'
status: verified
answer: 'a) $a=6$; b) $d=2\sqrt{3}$; v) $\frac{\sqrt{3}}{9}$'
check:
  - label: 'a)'
    kind: value
    expected: '6'
  - label: 'b)'
    kind: value
    expected: '2sqrt(3)'
  - label: 'v)'
    kind: value
    expected: 'sqrt(3)/9'
rubric:
  - id: edge-from-surface-volume
    points: 1
    text: 'Iz uslova $6a^2=a^3$ i geometrijskog uslova $a>0$ dobijena je ivica $a=6$.'
  - id: vertex-plane-distance
    points: 2
    text: 'Rastojanje do ravni tri susedna temena izračunato je preko zapremine odsečenog tetraedra i površine njegove jednakostranične strane, pa je $d=2\sqrt3$.'
  - id: sphere-volume-ratio
    points: 2
    text: 'Upotrebljeni su poluprečnici $r=a/2$ i $R=a\sqrt3/2$, a odnos zapremina je izračunat kao $(r/R)^3=\sqrt3/9$.'
---

## Zadatak

Data je kocka kod koje je površina (brojno) jednaka zapremini.

**a)** Naći ivicu kocke $a$.

**b)** Naći rastojanje od temena kocke do ravni koja prolazi kroz tri njemu susedna temena (ravan koja odseca ugao kocke).

**v)** Naći odnos zapremine lopte upisane u kocku prema zapremini lopte opisane oko kocke.

## Nagoveštaj 1

Površina kocke je $6a^2$, a zapremina $a^3$ — izjednači ih. Za b) posmatraj tetraedar koji ravan odseca kod temena: rastojanje se dobija preko njegove zapremine. Za v) uporedi poluprečnike upisane i opisane lopte.

## Nagoveštaj 2

Iz $P=V$ sledi $6a^2=a^3$ — reši po $a$. Tetraedar kod posmatranog temena ima tri uzajamno normalne ivice dužine $a$, pa je $V_{\text{tet}}=\dfrac{1}{6}a^3$; naspramna strana je jednakostraničan trougao sa stranicom $a\sqrt{2}$, a rastojanje je $d=\dfrac{3V_{\text{tet}}}{S}$. Za v): $r=\dfrac{a}{2}$, $R=\dfrac{a\sqrt{3}}{2}$, traženi odnos je $\left(\dfrac{r}{R}\right)^{3}$.

## Rešenje

**a)** Iz $P=V$: $6a^2=a^3\Rightarrow a=6$.

**b)** Tetraedar kod posmatranog temena ima tri uzajamno normalne ivice dužine $a$, pa je $V_{\text{tet}}=\dfrac{1}{6}a^3$. Naspramna strana tetraedra je jednakostraničan trougao sa stranicom $a\sqrt{2}$, površine $S=\dfrac{\sqrt{3}}{4}(a\sqrt{2})^2=\dfrac{\sqrt{3}}{2}a^2$. Rastojanje od temena do te ravni:

$$d=\frac{3V_{\text{tet}}}{S}=\frac{\frac12 a^3}{\frac{\sqrt{3}}{2}a^2}=\frac{a}{\sqrt{3}}=\frac{6}{\sqrt{3}}=2\sqrt{3}.$$

**v)** Upisana lopta ima $r=\dfrac{a}{2}$, opisana $R=\dfrac{a\sqrt{3}}{2}$, pa je $\dfrac{r}{R}=\dfrac{1}{\sqrt{3}}$ i

$$\frac{V_{\text{up}}}{V_{\text{op}}}=\left(\frac{1}{\sqrt{3}}\right)^{3}=\frac{1}{3\sqrt{3}}=\frac{\sqrt{3}}{9}.$$
