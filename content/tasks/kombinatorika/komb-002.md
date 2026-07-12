---
id: komb-002
slot: 10
topic: kombinatorika
difficulty: 3
source: 'Do indeksa (autorski)'
origin: 'FTN_P1_Tematski_Zadaci_sr.tex, slot 10, zadatak 3'
status: review
answer: 'a) $300$; b) $108$; v) $156$'
---

## Zadatak

Od cifara skupa $\{0,1,2,3,4,5\}$ obrazuju se **četvorocifreni** brojevi **sa različitim ciframa** (cifre se u broju ne ponavljaju). Koliko je takvih brojeva:

**a)** ukupno;

**b)** deljivih sa $5$;

**v)** parnih.

## Rešenje

**a)** Prva cifra nije jednaka $0$: $5$ mogućnosti. Ostale tri pozicije — različite cifre iz preostalih: $5\cdot 4\cdot 3$. Ukupno $5\cdot 5\cdot 4\cdot 3=300$.

**b)** Deljivost sa $5$ znači da je poslednja cifra $0$ ili $5$. Ako je poslednja cifra $0$: prve tri pozicije daju $5\cdot 4\cdot 3=60$. Ako je poslednja cifra $5$: prva nije $0$ ni $5$ ($4$ mogućnosti), zatim $4\cdot 3$, to jest $4\cdot 4\cdot 3=48$. Ukupno $60+48=108$.

**v)** Parnost: poslednja cifra $\in\{0,2,4\}$. Ako je poslednja $0$: $5\cdot 4\cdot 3=60$. Ako je poslednja $2$ ili $4$ ($2$ mogućnosti): prva nije $0$ ni izabrana poslednja ($4$ mogućnosti), dalje $4\cdot 3$, to jest $4\cdot 4\cdot 3=48$ za svaku, ukupno $96$. Ukupno $60+96=156$.
