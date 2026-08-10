# 0009 - Versioned FTN P1 blueprint and scoring boundary

**Status:** accepted - 2026-08-10

**Context.** The repository treated a topic's `slot` as a permanent exam
position, used a 180-minute timer, and converted a binary self-assessment into
an apparent official score. Current FTN sources define P1 as 10 tasks, 4 hours,
and at most 60 points. FTN grades the work shown and awards partial credit. The
official 2025 and 2026 variants also swap logarithmic and exponential material
between positions 3 and 4, so a topic cannot own an exam position forever.

**Decision.** P1 assembly is driven by immutable annual blueprint files under
`content/exams/ftn-p1/`. A blueprint records the observed position-to-topic
mapping, duration, maximum points, grading boundary, official URLs, retrieval
date, and SHA-256 for downloaded official PDFs. The latest version is selected
through `index.yaml`; changing an observed format creates a new file instead of
editing historical data.

The product distinguishes:

- `topic`: a mathematical content category;
- `examPosition`: an ordinal inside one blueprint version;
- automatic final-answer feedback: a training aid;
- official-style scoring: rubric-based, method-aware, and capable of partial
  credit.

A binary correct/incorrect review may still produce a clearly labelled trainer
estimate, but it is never presented as official FTN scoring. P2 and a separate
physics entrance exam are not part of the current FTN exam map and must not be
invented in the P1 product.

**Consequences.** Variant generation and tests depend on a blueprint version.
Historical runs will eventually persist that version with their task snapshot.
The temporary simulation still uses binary review, so its numeric result is an
estimate until the run/rubric model replaces it. Topic metadata and legacy
attempt `slot` remain compatibility fields and are not authoritative exam
structure.

Official sources:

- https://ftn.uns.ac.rs/nacin-polaganja/
- https://ftn.uns.ac.rs/upis/pet-zelja/
- https://ftn.uns.ac.rs/wp-content/uploads/2024/12/Osnovne-studije-2025-web.pdf
- https://ftn.uns.ac.rs/wp-content/uploads/2025/08/Prijemni25.pdf
- https://prijemni.ftn.uns.ac.rs/php/getResenjaTesta.php?VRT_SIFRA=P1
