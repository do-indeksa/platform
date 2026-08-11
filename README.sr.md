# Do indeksa

**Besplatna platforma koja pomaže maturantima da izaberu fakultet i spreme prijemni ispit.**

[![web CI](https://github.com/do-indeksa/platform/actions/workflows/web.yml/badge.svg)](https://github.com/do-indeksa/platform/actions/workflows/web.yml)
[![container CI](https://github.com/do-indeksa/platform/actions/workflows/images.yml/badge.svg)](https://github.com/do-indeksa/platform/actions/workflows/images.yml)

> English version: [README.md](README.md)

## Misija

Jednake šanse za upis — bez obzira na mesto i prihode. Kvalitetna priprema danas košta 20–30 € po privatnom času, a besplatne alternative su zastarele zbirke i razbacani PDF-ovi. Do indeksa je besplatna, moderna alternativa.

## Trenutni MVP

- Jedinstvena baza FTN P1 zadataka sa pretragom, filterima, izabranom vežbom, proverom tačnog odgovora, dvostepenim nagoveštajima, potpunim rešenjima i unapred popunjenom prijavom greške za konkretan zadatak.
- Dijagnostika sa nastavkom i izolacijom po nalogu, deterministički plan pripreme, zadatak dana i niz dana, i četvoročasovni probni ispit sa nastavkom na drugom uređaju i jasnom samoprocenom postupka za delimične bodove.
- Sinhronizovana istorija sa deljivim filterima zadataka, obnovljivim poreklom ocene i trendom bodova potpunih probnih ispita.
- Aktuelan katalog prijemnih ispita FTN-a za 29 programa i zvanične grupe P1/P3-P8; izmišljeni P2 i prijemni iz fizike ne postoje u proizvodu.
- 30 nezavisno napisanih zadataka u svih deset P1 oblasti. Prva tri kompletna paketa tema (9 zadataka) imaju verzionisanu matematičku verifikaciju; preostalih 21 su jasno označeni za pregled.
- Responsive interfejs na srpskom (`sr-Latn`), engleskom i ruskom. Kanonski obrazovni sadržaj ostaje na srpskoj latinici, kao na ispitu.
- Go API sa Google OAuth-om, sigurnim cookie sesijama, Postgres migracijama i gqlgen životnim ciklusom pokušaja i testova.

Priprema produkcionog izdanja za [doindeksa.rs](https://doindeksa.rs) je u toku.
Privatni Kubernetes origin biće objavljen isključivo kroz Cloudflare Tunnel i
još zahteva nove Google OAuth podatke; analitika ostaje bezbedno isključena dok
ne postoji self-hosted image bez poznatih kritičnih ranjivosti.
Obavezne granice edge-a, izolacije origina, provere i rollback-a opisuje
[production deployment contract](docs/DEPLOYMENT.md).

## Dva stuba platforme

| Stub          | Šta radi                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------- |
| **Izaberi**   | Vodič kroz fakultete: programi objašnjeni ljudskim jezikom, bodovanje i kvote, iskustva studenata |
| **Spremi se** | Baza zadataka sa detaljnim rešenjima, napredak po temama i četvoročasovne simulacije FTN P1       |

## Roadmap

| Kada         | Faza           | Obim                                                              |
| ------------ | -------------- | ----------------------------------------------------------------- |
| jesen 2026   | **MVP**        | Matematika za prijemni FTN (P1) + vodič kroz novosadske fakultete |
| zima 2026/27 | **Pilot**      | 2–3 škole, povratne informacije maturanata, novi sadržaj          |
| proleće 2027 | **Pun ciklus** | Kompletna priprema pred junski prijemni; širenje na ETF i FON     |

Dugoročno: platforma spremna za državnu maturu (2028/29) — pre nego što sistem stigne.

## Arhitektura

- **apps/web** — Next.js frontend (KaTeX za matematičke formule)
- **apps/api** — Go monolit: nalozi (Google OAuth), napredak, rezultati simulacija
- **content/** — zadaci i rešenja kao verzionisani fajlovi, pregled kroz pull request-ove
- **tools/** — pipeline za sadržaj (LaTeX → strukturirani zadaci)

Korisnički podaci žive u Postgres-u; obrazovni sadržaj živi u git-u.

## Lokalno pokretanje

Za web aplikaciju je potreban Node.js 22.13 ili noviji:

```bash
cd apps/web
npm ci
npm run dev
```

Otvori <http://localhost:3000>. Gostujući tokovi učenja rade bez naloga. Za ceo
stack, uključujući Postgres, OAuth i GraphQL, prati
[apps/api/README.md](apps/api/README.md).

## Licence

- Kod — [MIT](LICENSE)
- Obrazovni sadržaj (`content/`) — [CC BY-NC-SA 4.0](content/LICENSE.md): slobodno korišćenje i deljenje uz navođenje autora, komercijalna upotreba zabranjena

## Jezici

Kanonski obrazovni sadržaj je na srpskom (latinica), kao na pravom ispitu. Kompletan interfejs je dostupan na srpskom, engleskom i ruskom. Kod i glavna tehnička dokumentacija su na engleskom.
