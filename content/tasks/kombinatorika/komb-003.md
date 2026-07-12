---
id: komb-003
slot: 10
topic: kombinatorika
difficulty: 3
source: 'Do indeksa (autorski)'
origin: 'FTN_P1_Tematski_Zadaci_sr.tex, slot 10, zadatak 6'
status: review
answer: 'a) $460$; b) kompozicija $10$, razbijanja $3$; v) $27000$'
---

## Zadatak

**a)** Iz grupe u kojoj je $7$ mladića i $5$ devojaka bira se komisija od $4$ osobe. Na koliko načina se to može učiniti tako da u komisiji bude **bar jedna** devojka?

**b)** Na koliko načina se broj $6$ može napisati u obliku zbira $3$ prirodna sabirka, *ako se uzima u obzir redosled sabiraka* (kompozicije)? A na koliko — ako se redosled *ne uzima u obzir* (razbijanja)?

**v)** Kod se sastoji od dva **različita** slova iz skupa $\{A,B,C,D,E,F\}$, za kojima slede tri cifre, pri čemu prva cifra nije $0$ (na ostale cifre nema ograničenja, cifre se mogu ponavljati). Koliko se različitih kodova može sastaviti?

## Rešenje

**a)** Preko komplementa. Ukupno komisija od $4$ osobe: $\dbinom{12}{4}=495$. Komisija bez devojaka: $\dbinom{7}{4}=35$. „Bar jedna devojka“: $495-35=460$.

**b)** *Kompozicije* (redosled je važan) broja $6$ na $3$ prirodna sabirka — broj pozitivnih rešenja $x_1+x_2+x_3=6$: $\dbinom{6-1}{3-1}=\dbinom{5}{2}=10$. *Razbijanja* (redosled nije važan): $6=4+1+1=3+2+1=2+2+2$, to jest $3$.

**v)** Dva različita slova iz $6$ uz uvažavanje redosleda: $6\cdot 5=30$. Tri cifre, prva iz $\{1,\dots,9\}$, ostale dve bilo koje: $9\cdot 10\cdot 10=900$. Ukupno $30\cdot 900=27000$.
