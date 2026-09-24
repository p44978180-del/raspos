FROM rust:1.88-bookworm AS rust
WORKDIR /src
COPY platform/rust/timacad-core /src
RUN cargo build --release --bin compact-doc

FROM golang:1.25-bookworm AS go
WORKDIR /src
COPY platform/server /src
RUN go mod download && CGO_ENABLED=1 go build -o /out/server ./cmd/server \
    && CGO_ENABLED=1 go build -o /out/worker ./cmd/worker \
    && CGO_ENABLED=1 go build -o /out/bridge ./cmd/bridge

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=rust /src/target/release/compact-doc /usr/local/bin/compact-doc
COPY --from=go /out/server /usr/local/bin/server
COPY --from=go /out/worker /usr/local/bin/worker
COPY --from=go /out/bridge /usr/local/bin/bridge
EXPOSE 8080
ENTRYPOINT ["server"]
