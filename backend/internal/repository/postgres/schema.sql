-- schema.sql: Relational Schema for RGAU-MSHA Timiryazev Schedule

CREATE TABLE IF NOT EXISTS institutes (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS groups (
    id SERIAL PRIMARY KEY,
    institute_id INT REFERENCES institutes(id) ON DELETE CASCADE,
    name VARCHAR(50) NOT NULL UNIQUE,
    course INT NOT NULL,
    degree VARCHAR(20) NOT NULL
);

CREATE TABLE IF NOT EXISTS teachers (
    id SERIAL PRIMARY KEY,
    full_name VARCHAR(150) NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS classrooms (
    id SERIAL PRIMARY KEY,
    building VARCHAR(50) NOT NULL,
    room VARCHAR(50) NOT NULL,
    UNIQUE(building, room)
);

CREATE TABLE IF NOT EXISTS lessons (
    id SERIAL PRIMARY KEY,
    group_id INT REFERENCES groups(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 1 AND 7),
    slot_number INT NOT NULL,
    week_type VARCHAR(10) NOT NULL CHECK (week_type IN ('all', 'odd', 'even')),
    subject_name VARCHAR(255) NOT NULL,
    lesson_type VARCHAR(50) NOT NULL,
    subgroup_number INT NULL
);

CREATE TABLE IF NOT EXISTS lesson_assignments (
    lesson_id INT REFERENCES lessons(id) ON DELETE CASCADE,
    teacher_id INT REFERENCES teachers(id),
    classroom_id INT REFERENCES classrooms(id),
    PRIMARY KEY(lesson_id, teacher_id, classroom_id)
);

CREATE INDEX IF NOT EXISTS idx_schedule_lookup ON lessons (group_id, day_of_week, week_type);

-- Snapshots and Historical Deltas
CREATE TABLE IF NOT EXISTS schedule_snapshots (
    id SERIAL PRIMARY KEY,
    snapshot_hash VARCHAR(64) NOT NULL UNIQUE,
    source_url TEXT NOT NULL,
    data_format VARCHAR(20) NOT NULL,
    byte_size BIGINT NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schedule_deltas (
    detected_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    group_id INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    change_type VARCHAR(50) NOT NULL,
    previous_hash VARCHAR(64),
    current_hash VARCHAR(64) NOT NULL,
    details_json TEXT NOT NULL,
    PRIMARY KEY (detected_at, group_id, current_hash)
);

CREATE TABLE IF NOT EXISTS student_attendance_logs (
    recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    student_id VARCHAR(64) NOT NULL,
    group_id INT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    lesson_id INT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL,
    device_platform VARCHAR(30),
    PRIMARY KEY (recorded_at, student_id, lesson_id)
);

CREATE TABLE IF NOT EXISTS crowdsource_proposals (
    id SERIAL PRIMARY KEY,
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
    status VARCHAR(30) NOT NULL DEFAULT 'pending',
    display_badge VARCHAR(100) NOT NULL DEFAULT 'Проверяется одногруппниками',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crowdsource_votes (
    proposal_id INT REFERENCES crowdsource_proposals(id) ON DELETE CASCADE,
    student_name VARCHAR(100) NOT NULL,
    student_role VARCHAR(30) NOT NULL,
    vote_confirm BOOLEAN NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (proposal_id, student_name)
);

CREATE INDEX IF NOT EXISTS idx_deltas_group ON schedule_deltas (group_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_proposals_group ON crowdsource_proposals (group_id, status);
CREATE INDEX IF NOT EXISTS idx_classrooms_building ON classrooms (building);

