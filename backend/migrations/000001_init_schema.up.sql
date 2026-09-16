-- 000001_init_schema.up.sql
-- RGAU-MSHA Timiryazev Schedule Relational Schema

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
