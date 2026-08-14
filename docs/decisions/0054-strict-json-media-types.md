# 0054 - Parse JSON request media types strictly

**Status:** accepted - 2026-08-14.

**Context.** The diagnostic checker and simulation grader accepted a request
when its `Content-Type` value contained the text `application/json`. That
substring check also admitted different media types such as
`application/jsonp`, `application/json-patch+json`, and
`text/application/json`. It rejected the valid case-insensitive form
`Application/JSON`, and it did not validate parameter syntax.

**Decision.** Both content grading routes use one parser for the HTTP
media-type grammar and accept only the exact, case-insensitive
`application/json` type. Optional parameters must be syntactically valid token
or quoted-string pairs. Missing, malformed, combined, or merely similar media
types fail before body parsing with `415 Unsupported Media Type`.

**Consequences.** The two Next.js request boundaries now match the strict JSON
framing expected by the Go API without changing body-size limits, payload
validation, response shapes, or cache policy. The small local parser avoids a
runtime dependency and is covered independently from the route-level HTTP
contract.
