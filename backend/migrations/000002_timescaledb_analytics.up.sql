-- 000002_timescaledb_analytics.up.sql
-- Enterprise-Grade Data Engine: PostgreSQL + TimescaleDB partitioned hypertables
-- Supports semester sharding, high-throughput delta tracking, and historical attendance analytics

-- Enable TimescaleDB extension if installed
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- 1. Table: schedule_snapshots (Immutable raw data snapshots from S3/MinIO & scrapers)
CREATE TABLE IF NOT EXISTS schedule_snapshots (
    id BIGSERIAL PRIMARY KEY,
    snapshot_hash VARCHAR(64) NOT NULL UNIQUE,
    source_url TEXT NOT NULL,
    data_format VARCHAR(20) NOT NULL, -- 'json', 'pdf', 'html'
    byte_size BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Table: schedule_deltas (Hypertable for historical schedule modifications & audit log)
CREATE TABLE IF NOT EXISTS schedule_deltas (
    detected_at TIMESTAMPTZ NOT NULL,
    group_id INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    change_type VARCHAR(50) NOT NULL, -- 'lesson_added', 'lesson_cancelled', 'room_relocated', 'time_shifted'
    previous_hash VARCHAR(64),
    current_hash VARCHAR(64) NOT NULL,
    details_json JSONB NOT NULL,
    PRIMARY KEY (detected_at, group_id, current_hash)
);

-- Convert schedule_deltas into a TimescaleDB hypertable partitioned by time (7-day intervals)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('schedule_deltas', 'detected_at', chunk_time_interval => INTERVAL '7 days', if_not_exists => TRUE);
    END IF;
END $$;

-- 3. Table: student_attendance_logs (Hypertable for time-series attendance and crowd density analytics)
CREATE TABLE IF NOT EXISTS student_attendance_logs (
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    student_id VARCHAR(64) NOT NULL,
    group_id INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL CHECK (status IN ('present', 'absent', 'excused', 'remote')),
    device_platform VARCHAR(30),
    PRIMARY KEY (recorded_at, student_id, lesson_id)
);

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
        PERFORM create_hypertable('student_attendance_logs', 'recorded_at', chunk_time_interval => INTERVAL '14 days', if_not_exists => TRUE);
    END IF;
END $$;

-- 4. Table: crowdsource_proposals (Peer confirmation of room changes and lesson transfers)
CREATE TABLE IF NOT EXISTS crowdsource_proposals (
    id BIGSERIAL PRIMARY KEY,
    lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    group_id INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    student_name VARCHAR(100) NOT NULL,
    student_role VARCHAR(30) NOT NULL DEFAULT 'student',
    change_type VARCHAR(30) NOT NULL,
    target_day_of_week INT NULL,
    target_slot_number INT NULL,
    target_building VARCHAR(50) NULL,
    target_room VARCHAR(50) NULL,
    reason TEXT NOT NULL,
    peer_votes INT NOT NULL DEFAULT 1,
    has_deputy_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
    has_headstudent_confirmation BOOLEAN NOT NULL DEFAULT FALSE,
    status VARCHAR(30) NOT NULL DEFAULT 'pending', -- 'pending', 'peer_confirmed', 'officially_confirmed', 'rejected'
    display_badge VARCHAR(100) NOT NULL DEFAULT 'Проверяется одногруппниками',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: crowdsource_votes (Prevent double voting from same student)
CREATE TABLE IF NOT EXISTS crowdsource_votes (
    proposal_id BIGINT REFERENCES crowdsource_proposals(id) ON DELETE CASCADE,
    student_name VARCHAR(100) NOT NULL,
    student_role VARCHAR(30) NOT NULL,
    vote_confirm BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (proposal_id, student_name)
);

-- 5. Additional Indexes for High-Velocity Querying
CREATE INDEX IF NOT EXISTS idx_deltas_group_detected ON schedule_deltas (group_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_group ON student_attendance_logs (group_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_group_status ON crowdsource_proposals (group_id, status);
CREATE INDEX IF NOT EXISTS idx_classrooms_building ON classrooms (building);
