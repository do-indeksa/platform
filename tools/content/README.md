# Content pipeline

The pipeline has two independent gates:

1. `npm run check` verifies source SHA-256 values and proves that every current
   task origin resolves to a real statement and solution selector.
2. `npm run generate -- --manifest FILE --output DIR` parses a reviewer
   manifest and creates a new directory of structured task files atomically.

The importer uses a LaTeX AST. A selector such as `3` addresses the third task
in a slot; `3a` addresses its first subtask. Reviewer manifests provide the
fields that cannot be inferred safely: topic, difficulty, final answer,
machine-check parts, and the two-step hint ladder.

## Manifest

```json
{
  "version": 1,
  "collection": "ftn-p1-thematic-sr",
  "defaults": {
    "source": "Do indeksa (autorski)",
    "status": "draft"
  },
  "tasks": [
    {
      "id": "kb-004",
      "slot": 1,
      "selector": "2a",
      "topic": "kompleksni-brojevi",
      "difficulty": 3,
      "answer": "$z=1$",
      "check": [{ "kind": "value", "expected": "1" }],
      "hints": ["Direction without the answer.", "Concrete first step."]
    }
  ]
}
```

Use Serbian Latin script in actual hints. The abbreviated English text above
only documents the distinct roles of the two hint levels.
