# Tools

## Content pipeline

`content/` contains the public, reviewed learning material. The importer in
`tools/content/` turns the repository's hash-pinned authored LaTeX workbooks
into isolated Markdown drafts and audits every existing task origin in CI.

```bash
cd tools/content
npm ci
npm test
npm run check
npm run generate -- \
  --manifest examples/one-task.json \
  --output /tmp/do-indeksa-import
```

Generation refuses to overwrite an existing directory. Review the isolated
output, run the web content tests, and submit the selected files through a
content pull request. The importer can create only `draft` or `review` status;
`verified` remains a human review decision.
