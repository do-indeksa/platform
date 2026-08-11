---
id: ster-003
slot: 8
topic: stereometrija
difficulty: 4
source: 'Do indeksa (autorski)'
origin: 'FTN_P1_Tematski_Zadaci_sr.tex, slot 8, zadatak 2'
status: verified
answer: 'a) $b=\frac{aH}{a+H}$; b) $b=4$, $V=64$, $P=96$; v) $\frac{4}{9}$'
check:
  - label: 'b) V'
    kind: value
    expected: '64'
  - label: 'b) P'
    kind: value
    expected: '96'
  - label: 'v)'
    kind: value
    expected: '4/9'
rubric:
  - id: cube-edge-from-section
    points: 2
    text: 'Iz linearnog smanjivanja horizontalnog preseka i uslova na visini $z=b$ izvedeno je $b=aH/(a+H)$.'
  - id: cube-measures
    points: 2
    text: 'Za $a=6$ i $H=12$ tačno su izračunati $b=4$, zapremina $64$ i površina $96$.'
  - id: cube-pyramid-volume-ratio
    points: 1
    text: 'Zapremina kocke upoređena je sa $V_{\text{pir}}=a^2H/3=144$, pa je dobijen odnos $4/9$.'
---

## Zadatak

U pravilnu četvorostranu piramidu sa stranicom osnove $a$ i visinom $H$ upisana je kocka: jedna strana kocke leži u osnovi piramide, centrirana je i njene ivice su paralelne odgovarajućim ivicama osnove piramide, a četiri gornja temena kocke leže na bočnim stranama piramide.

**a)** Izraziti ivicu kocke $b$ kao funkciju od $a$ i $H$.

**b)** Za $a=6$, $H=12$ naći ivicu kocke, njenu zapreminu i površinu.

**v)** Za iste $a,H$ naći odnos zapremine kocke prema zapremini piramide.

## Nagoveštaj 1

Postavi koordinatu po visini piramide: horizontalni presek na visini $z$ je kvadrat čija stranica linearno opada sa $z$. Gornja strana kocke leži baš u jednom takvom preseku.

## Nagoveštaj 2

Presek na visini $z$ ima stranicu $a\cdot\dfrac{H-z}{H}$; za gornju stranu kocke važi $z=b$ i stranica preseka je jednaka $b$. Iz te jednačine izrazi $b$, pa uvrsti $a=6$, $H=12$. Za v): $V_{\text{pir}}=\dfrac{1}{3}a^2H$.

## Rešenje

**a)** Zbog zadate paralelne orijentacije, horizontalni presek piramide na visini $z$ je kvadrat sa stranicom $a\cdot\dfrac{H-z}{H}$, a gornja strana kocke na visini $z=b$ poklapa se s tim presekom. Zato je njena stranica $b$ jednaka stranici preseka:

$$b=a\cdot\frac{H-b}{H}\Rightarrow b(a+H)=aH\Rightarrow b=\frac{aH}{a+H}.$$

**b)** Za $a=6,\ H=12$: $b=\dfrac{72}{18}=4$, $V_{\text{kocka}}=4^3=64$, $P_{\text{kocka}}=6\cdot 16=96$.

**v)** $V_{\text{pir}}=\dfrac{1}{3}a^2H=\dfrac{1}{3}\cdot 36\cdot 12=144$, pa je $\dfrac{V_{\text{kocka}}}{V_{\text{pir}}}=\dfrac{64}{144}=\dfrac{4}{9}$.
