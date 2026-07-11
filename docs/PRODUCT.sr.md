# Vizija proizvoda

> English version: [PRODUCT.md](PRODUCT.md)

## Publika

Svaki maturant u Srbiji koji se sprema za prijemni na državnim univerzitetima. Primarne destinacije: državni fakulteti u **Novom Sadu i Beogradu**. Fokus MVP-a: matematika za prijemni FTN (P1) + vodič kroz FTN.

## Referentni model

UX uzor je model „banke zadataka" dokazan na velikim platformama za pripremu ispita: zvanične PDF zbirke imaju više sadržaja, ali učenici biraju platformu zbog četiri stvari:

1. **Trenutna provera** — rešavaš u browseru, odmah proveriš, bez traženja rešenja po knjigama
2. **Navigacija po slotovima ispita** — ispit ima fiksnu strukturu, pa je vežbanje organizovano „po broju zadatka"
3. **Generator varijanti** — neograničeni probni ispiti sastavljeni iz banke
4. **Statistika** — vidljiv lični napredak kroz vreme

P1 se savršeno uklapa: uvek ima 10 zadataka fiksnih tipova (slot 3 = logaritmi, slot 10 = kombinatorika, …). Struktura slotova JESTE navigacija.

## Osnovna petlja

```
Dijagnostički test (10 zadataka, po jedan iz svakog slota, ~40 min)
        ↓
Karta znanja: slabi slotovi istaknuti → lični plan pripreme do juna
        ↓
Dnevno vežbanje: tema iz plana / zadatak dana
        ↓
Na 1–2 nedelje: probni ispit (generisan) → grafik rasta bodova
        ↓
Karta znanja se ažurira → plan se preračunava → ponovi
```

## Mehanike zadržavanja

| Mehanika | Cena | Efekat | Kada |
|---|---|---|---|
| Karta znanja: % savladanosti po slotu | niska | jezgro | MVP |
| Generator varijanti: nasumičan zadatak po slotu | niska | ~300 zadataka → neograničeni probni | MVP |
| Plan pripreme: nedeljni checklist do ispita | srednja | razlog br. 1 za povratak | MVP (pojednostavljen) |
| Grafik rasta bodova kroz pokušaje | niska | „napredak koji se meri" | MVP |
| Zadatak dana + streak | niska | dnevna kuka | MVP ako stignemo |
| Email pregled „tvoja nedelja" | srednja | reaktivacija | jesen |
| Nalozi za nastavnike (zadavanje domaćih) | visoka | glavni kanal rasta referentnog modela | pilot, zima |

## Privlačenje korisnika (nula budžeta)

1. **SEO — primarni kanal.** Upiti tipa „prijemni FTN zadaci", „kalkulator bodova FTN", „prijemni ispit matematika rešenja" skoro da nemaju konkurenciju. Stranice fakulteta + kalkulator bodova ih pokrivaju. Tražnja za kalkulatorom je najveća u julu, kada izlaze rang-liste — prozor lansiranja se poklapa.
2. **TikTok / IG Reels** — „možeš li da rešiš zadatak sa prijemnog?" klipovi od 30 sekundi; zadatak dana daje beskrajan materijal.
3. **Školski Viber/WhatsApp četovi** — kalkulator se prirodno deli.
4. **Ambasadori (Klub stipendista)** — posete školama od septembra.

## Obim MVP-a (kraj jula 2026)

- Katalog zadataka po slotu/temi sa težinom i brojačima
- Stranica zadatka: tekst (KaTeX), prikaz rešenja, samoprovera
- Dijagnostički test → karta znanja
- Simulacija: tajmer 180 min, bodovanje P1 (10 × 6 = 60), istorija pokušaja
- Generator varijanti
- Pojednostavljen plan pripreme (nedeljni checklist)
- Kalkulator bodova + vodič kroz FTN smerove
- Nalozi (Google OAuth), sinhronizovan napredak
- Landing, analitika (Umami)

## KPI (do 30. septembra 2026)

- 100 registrovanih korisnika
- ≥30% registrovanih završi dijagnostiku
- ≥20% se vrati u drugoj nedelji

Namerno skromno: jul–avgust je van sezone; prava sezona počinje u septembru–oktobru kada nova generacija maturanata kreće sa pripremom.
