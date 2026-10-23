# syntax=docker/dockerfile:1
#
# adebite API. Build from the api/ directory:
#   docker build -t adebite-api .
#   docker run --rm -p 8080:8080 --env-file .env.local adebite-api
#
# Configuration comes from environment variables only (.env files are not
# copied in). Migrations run on start unless RUN_MIGRATIONS=false; to run them
# as a separate release step instead: docker run --rm --env-file … adebite-api migrate

# Build on the host's architecture and cross-compile, so an amd64 image builds
# natively on an Apple Silicon Mac (no QEMU).
FROM --platform=$BUILDPLATFORM golang:1.24-alpine AS build
ARG TARGETOS
ARG TARGETARCH
WORKDIR /src

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download

COPY . .
# timetzdata embeds the zone database: user time zones (time.LoadLocation)
# must not depend on what the base image ships.
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -tags timetzdata -ldflags="-s -w" -o /out/api ./cmd/api

# No shell, no package manager; includes CA certificates for Google, the AI
# providers, R2 and Web Push.
FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/api /api
ENV APP_ENV=production \
    HTTP_ADDR=:8080
EXPOSE 8080
USER nonroot:nonroot
ENTRYPOINT ["/api"]
