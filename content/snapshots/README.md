# Immutable task snapshots

`tasks/<task-id>/<sha256>.md` stores the exact bytes of a verified task revision.
The filename digest is the value used by web runtime as `sha256:<sha256>`.

Generate missing files from `tools/content/` with `npm run snapshot`. Never edit,
rename, or delete an existing task snapshot. The content audit verifies the
path, digest, frontmatter, and current-task coverage; CI also checks Git history.

This archive does not expose a runtime resolver or render untrusted HTML.
