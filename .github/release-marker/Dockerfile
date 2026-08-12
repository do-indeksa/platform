# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

FROM scratch
ARG RELEASE_REVISION
ARG API_IMAGE
ARG WEB_IMAGE
LABEL org.opencontainers.image.title="Do indeksa release marker" \
      org.opencontainers.image.description="Atomic API and web release pair" \
      org.opencontainers.image.source="https://github.com/do-indeksa/platform" \
      org.opencontainers.image.revision="${RELEASE_REVISION}" \
      rs.doindeksa.release.api="${API_IMAGE}" \
      rs.doindeksa.release.web="${WEB_IMAGE}"
USER 65532:65532
