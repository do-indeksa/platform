# Content verification records

`review` means that a task is publishable and schema-valid. `verified` adds a
second bar: the full topic pack has been matched to its authored source,
recalculated independently, exercised through the machine checker, and rendered
without math errors.

Every `verified` task must belong to exactly one versioned review record in this
directory. A record covers every task in each listed topic; partial topic
promotion is rejected by CI. The pull request and commit history identify who
performed and approved each review.
