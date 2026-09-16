-- 000002_timescaledb_analytics.down.sql

DROP TABLE IF EXISTS crowdsource_votes;
DROP TABLE IF EXISTS crowdsource_proposals;
DROP TABLE IF EXISTS student_attendance_logs;
DROP TABLE IF EXISTS schedule_deltas;
DROP TABLE IF EXISTS schedule_snapshots;
