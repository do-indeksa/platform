# Do indeksa

**Besplatna platforma koja pomaže maturantima da izaberu fakultet i spreme prijemni ispit.**

> English version: [README.md](README.md)

## Misija

Jednake šanse za upis — bez obzira na mesto i prihode. Kvalitetna priprema danas košta 20–30 € po privatnom času, a besplatne alternative su zastarele zbirke i razbacani PDF-ovi. Do indeksa je besplatna, moderna alternativa.

## Dva stuba platforme

| Stub | Šta radi |
|---|---|
| **Izaberi** | Vodič kroz fakultete: programi objašnjeni ljudskim jezikom, bodovanje i kvote, iskustva studenata |
| **Spremi se** | Baza zadataka sa detaljnim rešenjima, napredak po temama, simulacije sa tajmerom (180 min, realan format P1) |

## Roadmap

| Kada | Faza | Obim |
|---|---|---|
| jesen 2026 | **MVP** | Matematika za prijemni FTN (P1) + vodič kroz novosadske fakultete |
| zima 2026/27 | **Pilot** | 2–3 škole, povratne informacije maturanata, novi sadržaj |
| proleće 2027 | **Pun ciklus** | Kompletna priprema pred junski prijemni; širenje na ETF i FON |

Dugoročno: platforma spremna za državnu maturu (2028/29) — pre nego što sistem stigne.

## Arhitektura

- **apps/web** — Next.js frontend (KaTeX za matematičke formule)
- **apps/api** — Go monolit: nalozi (Google OAuth), napredak, rezultati simulacija
- **content/** — zadaci i rešenja kao verzionisani fajlovi, pregled kroz pull request-ove
- **tools/** — pipeline za sadržaj (LaTeX → strukturirani zadaci)

Korisnički podaci žive u Postgres-u; obrazovni sadržaj živi u git-u.

## Licence

- Kod — [MIT](LICENSE)
- Obrazovni sadržaj (`content/`) — [CC BY-NC-SA 4.0](content/LICENSE.md): slobodno korišćenje i deljenje uz navođenje autora, komercijalna upotreba zabranjena

## Jezici

Sadržaj platforme je na srpskom (latinica), kao na pravom ispitu. Kod i tehnička dokumentacija su na engleskom.
