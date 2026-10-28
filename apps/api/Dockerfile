# KloudLab API: static Go binary on distroless (nonroot, uid 65532).
# Build from apps/api: docker build -t kloudlab-api apps/api
FROM golang:1.26-alpine AS build
WORKDIR /src
ENV CGO_ENABLED=0 GOOS=linux GOFLAGS=-trimpath
COPY go.mod go.sum* ./
COPY cmd ./cmd
COPY internal ./internal
# go.sum is not committed yet: resolve it here until it is (then the
# tidy step is a no-op and the download uses the committed sums).
RUN if [ ! -f go.sum ]; then go mod tidy; fi && go mod download
RUN go build -ldflags="-s -w" -o /out/kloudlab-api ./cmd/api

FROM gcr.io/distroless/static-debian12:nonroot
COPY --from=build /out/kloudlab-api /kloudlab-api
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/kloudlab-api"]
