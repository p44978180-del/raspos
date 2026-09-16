-- 000001_init_schema.down.sql
DROP INDEX IF EXISTS idx_schedule_lookup;
DROP TABLE IF EXISTS lesson_assignments;
DROP TABLE IF EXISTS lessons;
DROP TABLE IF EXISTS classrooms;
DROP TABLE IF EXISTS teachers;
DROP TABLE IF EXISTS groups;
DROP TABLE IF EXISTS institutes;
