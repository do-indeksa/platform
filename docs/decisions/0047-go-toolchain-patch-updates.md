# 0047 - Go toolchain patch updates

**Status:** accepted - 2026-08-14.

**Context.** The API pinned Go 1.25.12 in both its module and Docker build
stage. A current `govulncheck` scan found six reachable standard-library
vulnerabilities fixed in Go 1.25.13. Because CI resolves Go from `go.mod` and
the production binary is compiled in the pinned container stage, updating only
one location would leave either verification or the shipped binary on the
vulnerable patch release.

**Decision.** The API's `go` directive is a security pin, not only a minimum
language version. Patch releases are updated together in `go.mod` and the
immutable official Golang build-image digest. A toolchain update must leave
module dependencies and generated code unchanged and pass build, generation,
tests, race detection, vet, lint, `govulncheck`, runtime smoke, and runtime-image
scanning before review.

The runtime remains the separately pinned distroless non-root image; changing
the compiler does not implicitly change the production base. Minor or major Go
upgrades still require a separate compatibility decision rather than following
this patch-update rule automatically.

**Consequences.** Local development and CI may download the exact patch
toolchain declared by the module. The production binary and CI evidence use the
same standard-library fixes, while Docker builds remain reproducible through a
multi-platform digest. Future reachable standard-library advisories block API
delivery until the corresponding patch pin is updated and verified.
