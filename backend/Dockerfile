# Stage 1: Build Go application
FROM golang:1.23-alpine AS builder

WORKDIR /build

# Copy go mod and dependencies
COPY backend/go.mod backend/go.sum* ./
RUN go mod download || true

# Copy backend source code
COPY backend/ ./
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o /build/server ./cmd/server/main.go

# Stage 2: Runtime image with Python 3 for PDF parser bridge
FROM python:3.11-alpine

WORKDIR /app

# Install runtime dependencies for PDF parser and health checks
RUN apk add --no-cache bash ca-certificates tzdata wget \
    && pip install --no-cache-dir pdfplumber pydantic

# Copy binary and migrations
COPY --from=builder /build/server /app/server
COPY backend/migrations /app/migrations

# Default environment configuration
ENV PORT=8080 \
    DATABASE_URL=postgres://postgres:postgrespassword@postgres:5432/timacad_schedule?sslmode=disable \
    REDIS_URL=redis://redis:6379/0 \
    PYTHON_BIN=python3 \
    PARSER_SCRIPT_PATH=/app/scripts/timacad_parser.py \
    SCHEDULE_DATA_PATH=/app/public/data/official-schedule.json \
    AUTO_SEED=true

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1

CMD ["/app/server"]
