---
id: ster-002
slot: 8
topic: stereometrija
difficulty: 4
source: 'Do indeksa (autorski)'
origin: 'FTN_P1_Tematski_Zadaci_sr.tex, slot 8, zadatak 1'
status: verified
answer: 'a) $H=4$, $s=5$, $V=12\pi$, $P=24\pi$; b) $\rho=\frac{3}{2}$; v) $\frac{3}{8}$'
check:
  - label: 'a) V'
    kind: value
    expected: '12pi'
  - label: 'a) P'
    kind: value
    expected: '24pi'
  - label: 'b)'
    kind: value
    expected: '3/2'
  - label: 'v)'
    kind: value
    expected: '3/8'
rubric:
  - id: cone-dimensions-and-measures
    points: 2
    text: 'Uslovi $2H=r+s$ i $s^2=r^2+H^2$ rešeni su za pozitivnu visinu, a zatim su tačno dobijeni $H=4$, $s=5$, $V=12\pi$ i $P=24\pi$.'
  - id: inscribed-sphere-radius
    points: 2
    text: 'Osni presek kupe pravilno je iskorišćen za poluprečnik upisane kružnice, odnosno lopte, $\rho=S/p=3/2$.'
  - id: cone-sphere-volume-ratio
    points: 1
    text: 'Zapremina lopte je izračunata i podeljena zapreminom kupe, uz konačni odnos $3/8$.'
---

## Zadatak

Data je prava kružna kupa, kod koje poluprečnik osnove $r$, visina $H$ i izvodnica $s$ čine (upravo tim redom) aritmetičku progresiju, pri čemu je $r=3$.

**a)** Naći $H$ i $s$, a zatim zapreminu i površinu kupe.

**b)** U kupu je upisana lopta (dodiruje osnovu i omotač). Naći poluprečnik $\rho$ te lopte.

**v)** Izračunati odnos zapremine upisane lopte prema zapremini kupe.

## Nagoveštaj 1

Tri veličine čine aritmetičku progresiju kada je srednja jednaka polovini zbira susednih. Druga veza između $r$, $H$ i $s$ je Pitagorina teorema iz osnog preseka. Za b) posmatraj osni presek: upisana lopta u njemu postaje upisana kružnica trougla.

## Nagoveštaj 2

Iz uslova progresije $2H=r+s$ i $s^2=r^2+H^2$ sa $r=3$: zameni $s=2H-3$ i reši kvadratnu jednačinu po $H$. Za b): osni presek je jednakokraki trougao sa osnovicom $2r=6$, pa je $\rho=\dfrac{S}{p}$. Za v): $V_{\text{lopta}}=\dfrac{4}{3}\pi\rho^3$.

## Rešenje

**a)** Uslov progresije: $2H=r+s$, a iz osnog preseka $s^2=r^2+H^2$. Za $r=3$ imamo $s=2H-3$, pa je

$$(2H-3)^2=9+H^2\Rightarrow 3H^2-12H=0\Rightarrow H=4,\quad s=5.$$

Progresija je $3,4,5$ sa razlikom $1$. Tada $V=\dfrac{1}{3}\pi r^2 H=\dfrac{1}{3}\pi\cdot 9\cdot 4=12\pi$ i $P=\pi r^2+\pi rs=9\pi+15\pi=24\pi$.

**b)** Osni presek je jednakokraki trougao sa osnovicom $2r=6$ i kracima $5$ (visina $4$). Poluprečnik upisane kružnice $\rho=\dfrac{S}{p}=\dfrac{12}{8}=\dfrac{3}{2}$.

**v)** $V_{\text{lopta}}=\dfrac{4}{3}\pi\rho^3=\dfrac{4}{3}\pi\cdot\dfrac{27}{8}=\dfrac{9}{2}\pi$, odakle $\dfrac{V_{\text{lopta}}}{V_{\text{kupa}}}=\dfrac{9\pi/2}{12\pi}=\dfrac{3}{8}$.
