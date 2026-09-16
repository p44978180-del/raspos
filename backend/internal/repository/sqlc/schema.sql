-- PostgreSQL 16+ Timacad Relational DDL Schema with Composite Indices
CREATE TABLE IF NOT EXISTS institutes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(64) NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    name VARCHAR(64) NOT NULL UNIQUE,
    institute_id INT NOT NULL REFERENCES institutes(id) ON DELETE CASCADE,
    course INT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS teachers (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    department VARCHAR(255) NOT NULL,
    email VARCHAR(128) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS classrooms (
    id SERIAL PRIMARY KEY,
    building VARCHAR(128) NOT NULL,
    room VARCHAR(64) NOT NULL,
    floor INT NOT NULL DEFAULT 1,
    has_outlets BOOLEAN NOT NULL DEFAULT FALSE,
    is_quiet_zone BOOLEAN NOT NULL DEFAULT FALSE,
    capacity INT NOT NULL DEFAULT 30,
    CONSTRAINT uq_classroom UNIQUE (building, room)
);

CREATE TABLE IF NOT EXISTS lessons (
    id SERIAL PRIMARY KEY,
    subject VARCHAR(255) NOT NULL,
    type VARCHAR(32) NOT NULL,
    department VARCHAR(255) NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS lesson_assignments (
    id BIGSERIAL PRIMARY KEY,
    group_id INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    teacher_id INT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    classroom_id INT NOT NULL REFERENCES classrooms(id) ON DELETE CASCADE,
    slot_number INT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    day_of_week INT NOT NULL, -- 1=Monday .. 6=Saturday
    week_parity VARCHAR(16) NOT NULL DEFAULT 'all', -- odd, even, all
    subgroup INT, -- 1, 2, or NULL for whole group
    is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
    cancel_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ultra-fast composite lookup indices for 0ms queries
CREATE INDEX IF NOT EXISTS idx_assignments_group_lookup 
ON lesson_assignments(group_id, day_of_week, week_parity);

CREATE INDEX IF NOT EXISTS idx_assignments_radar_lookup 
ON lesson_assignments(classroom_id, day_of_week, slot_number, week_parity) 
WHERE is_cancelled = FALSE;
