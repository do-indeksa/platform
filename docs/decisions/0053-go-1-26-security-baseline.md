# 0053 - Move the API security baseline to Go 1.26

**Status:** accepted - 2026-08-14; extends
[0047](0047-go-toolchain-patch-updates.md).

**Context.** The API used Go 1.25.13 in both its module directive and pinned
Docker build stage. A fresh runtime-image scan reports the Go standard library
in that binary as affected by high-severity `CVE-2026-46600`. No fixed Go 1.25
release is available. Go 1.26.6 is the first stable fixed version listed by the
scanner and was released on 2026-08-13 with standard-library security fixes.
Moving between minor toolchain releases requires an explicit compatibility
decision under [0047](0047-go-toolchain-patch-updates.md).

**Decision.** Move the API module and immutable multi-platform Docker build
image together to Go 1.26.6. Treat the Go 1 compatibility promise as a starting
point, then require generation, build, vet, tests, race detection, lint,
`govulncheck`, runtime smoke, and runtime-image scanning before review. Update
the CI scanner to `govulncheck` 1.7.0, released alongside the new security
baseline with the Go package-loading support it requires. Keep module
dependencies, generated code, and the distroless non-root runtime base
unchanged.

**Consequences.** CI and production binaries use the same supported security
baseline and include the fixed standard library. The minor compiler and runtime
upgrade receives the same behavioral evidence as an application change rather
than being accepted as a metadata-only bump. Future patch updates within Go
1.26 continue to follow [0047](0047-go-toolchain-patch-updates.md); another
minor-version move still requires a separate decision.
