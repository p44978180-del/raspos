# RGAU-MSHA Timiryazev Schedule Backend

High-performance REST API and scheduling service built with Go (Clean Architecture), PostgreSQL 16+, Redis 7+, and Python PDF Parser Bridge.

## Architecture

This backend follows **Clean Architecture**:
```
backend/
├── cmd/
│   └── server/
│       └── main.go                 # Dependency injection, configuration & graceful shutdown
├── internal/
│   ├── config/                     # Environment configuration loader
│   ├── domain/                     # Core domain entities (Institute, Group, Lesson, Teacher, Classroom)
│   ├── repository/
│   │   ├── postgres/               # pgx connection pool, DDL migrations & JSON auto-seeder
│   │   └── redis/                  # Redis client with 24-hour TTL caching & invalidation
│   ├── usecase/                    # Business use cases (Schedule, Institute, Group, Sync worker pool)
│   └── delivery/
│       └── http/                   # Chi router, HTTP handlers & CORS middleware
├── pkg/
│   └── parser/                     # Parser bridge executing scripts/timacad_parser.py
├── migrations/
│   ├── 000001_init_schema.up.sql   # PostgreSQL DDL migrations
│   └── 000001_init_schema.down.sql
├── Dockerfile                      # Multi-stage build (golang:1.23 + python:3.11-alpine)
├── docker-compose.yml              # PostgreSQL, Redis, Backend container stack
└── go.mod
```

## Relational Schema (PostgreSQL 16+)

Strictly matching official requirements:
- `institutes` (`id`, `name`)
- `groups` (`id`, `institute_id`, `name`, `course`, `degree`)
- `teachers` (`id`, `full_name`)
- `classrooms` (`id`, `building`, `room`)
- `lessons` (`id`, `group_id`, `day_of_week`, `slot_number`, `week_type`, `subject_name`, `lesson_type`, `subgroup_number`)
- `lesson_assignments` (`lesson_id`, `teacher_id`, `classroom_id`)
- `idx_schedule_lookup` on `lessons(group_id, day_of_week, week_type)`

## Redis Caching Strategy

- Key format: `schedule:group:{group_id}:sem:{semester}:week:{odd|even|all}`
- TTL: 86400 seconds (24 hours)
- Invalidation: `DEL schedule:group:{group_id}:*` automatically triggered on completion of sync

## Auto-Seeding

On server startup, if PostgreSQL has 0 groups, it automatically parses and imports `public/data/official-schedule.json` into PostgreSQL transactionally. All 409 groups and 9,221 classes become available immediately.

## REST API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/healthz` | Service healthcheck (`{"status": "healthy"}`) |
| `GET` | `/api/v1/institutes` | List all institutes and available courses |
| `GET` | `/api/v1/groups?institute_id=1&course=1` | Filter groups by institute and course |
| `GET` | `/api/v1/schedule?group_id=42&week=odd` | Schedule grid with odd/even parity filtering |
| `POST` | `/api/v1/admin/sync-schedule` | Trigger background Python parser bridge |
| `GET` | `/api/v1/admin/sync-schedule/status` | Current status of background sync worker |

## Running Locally

### Via Docker Compose

```bash
cd backend
docker compose up -d
```

Check logs:
```bash
docker compose logs -f backend
```

Validate compose configuration:
```bash
docker compose config
```

### Running Tests

```bash
docker run --rm -v "%cd%:/backend" -w /backend golang:1.23-alpine go test -v ./...
```
