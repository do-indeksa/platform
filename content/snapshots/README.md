# Immutable task snapshots

`tasks/<task-id>/<sha256>.md` stores the exact bytes of a verified task revision.
The filename digest is the value used by web runtime as `sha256:<sha256>`.

Generate missing files from `tools/content/` with `npm run snapshot`. Never edit,
rename, or delete an existing task snapshot. The content audit verifies the
path, digest, frontmatter, and current-task coverage; CI also checks Git history.
Historical backfills must copy the exact bytes of a verified revision from Git
history; do not synthesize archive fixtures.

The server resolver validates the requested ID, revision, digest, and trusted
metadata before parsing a snapshot. The UI renders its Markdown through the same
sanitized pipeline as current task content.
