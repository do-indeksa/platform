# Product Vision

> Srpska verzija: [PRODUCT.sr.md](PRODUCT.sr.md)

## Audience

Any maturant (final-year high-school student) in Serbia preparing for state university entrance exams. Primary destinations: state faculties in **Novi Sad and Belgrade**. MVP focus: mathematics for the FTN (Novi Sad) P1 exam + FTN faculty guide.

## Reference model

The UX benchmark is the "task bank" model proven by large exam-prep platforms (e.g. Reshu EGE in Russia): the official PDF banks have more content, yet students prefer the platform because of four things:

1. **Instant feedback** — solve in the browser, check immediately, no digging through answer keys
2. **Navigation by area and exam position** — practice follows the observed structure of a specific annual format
3. **Variant generator** — unlimited mock exams assembled from the bank
4. **Statistics** — visible personal growth over time

P1 has ten positions, but a topic does not own one position forever: logarithmic and exponential tasks swapped positions 3 and 4 between the official 2025 and 2026 variants. Practice is organized by stable mathematical areas; generated mocks use a versioned annual blueprint.

## Core loop

```
Diagnostic test (short coverage across P1 areas, ~40 min)
        ↓
Knowledge map: weak areas highlighted → personal prep plan until June
        ↓
Daily practice: topic of the plan / task of the day
        ↓
Every 1–2 weeks: mock exam (generated) → score growth chart
        ↓
Knowledge map updates → plan recalculates → repeat
```

## Retention mechanics

| Mechanic                                   | Cost   | Effect                                         | When               |
| ------------------------------------------ | ------ | ---------------------------------------------- | ------------------ |
| Knowledge map: mastery % per area          | low    | core                                           | MVP                |
| Blueprint variant generator                | low    | turns a reviewed bank into annual-format mocks | MVP                |
| Prep plan: weekly checklist until the exam | medium | reason #1 to come back                         | MVP (simplified)   |
| Score growth chart across attempts         | low    | "progress you can measure"                     | MVP                |
| Task of the day + streak                   | low    | daily hook                                     | MVP if time allows |
| Email digest "your week"                   | medium | reactivation                                   | autumn             |
| Teacher accounts (assign homework)         | high   | main growth channel of the reference model     | pilot, winter      |

## Acquisition (zero budget)

1. **SEO — primary channel.** Queries like "prijemni FTN zadaci", "kalkulator bodova FTN", "prijemni ispit matematika rešenja" have near-zero competition. Faculty pages + the score calculator cover them. Calculator demand peaks in July when rang-liste are published — the launch window matches it.
2. **TikTok / IG Reels** — "možeš li da rešiš zadatak sa prijemnog?" 30-second clips; task of the day provides endless material.
3. **School Viber/WhatsApp chats** — the calculator is inherently shareable.
4. **Ambassadors (Klub stipendista)** — school visits from September.

## MVP scope (end of July 2026)

- Task catalog by area with difficulty and counters
- Task page: statement (KaTeX), solution reveal, self-check
- Diagnostic test → knowledge map
- Simulation engine: four-hour timer, method-aware self-review, clearly labelled trainer estimate, attempt history
- Variant generator
- Simplified prep plan (weekly checklist)
- Score calculator (kalkulator bodova) + FTN programs guide
- Accounts (Google OAuth), progress synced
- Landing, analytics (Umami)

## KPIs (by September 30, 2026)

- 100 registered users
- ≥30% of registered complete the diagnostic
- ≥20% return in their second week

Modest on purpose: July–August is off-season; the real season starts in September–October when the new maturant generation begins preparing.
