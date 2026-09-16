-- name: GetScheduleByGroup :many
SELECT 
    la.id,
    la.slot_number,
    la.start_time,
    la.end_time,
    la.day_of_week,
    la.week_parity,
    la.subgroup,
    la.is_cancelled,
    l.subject,
    l.type AS lesson_type,
    t.full_name AS teacher_name,
    c.building,
    c.room
FROM lesson_assignments la
JOIN lessons l ON la.lesson_id = l.id
JOIN teachers t ON la.teacher_id = t.id
JOIN classrooms c ON la.classroom_id = c.id
WHERE la.group_id = $1 
  AND ($2 = 'all' OR la.week_parity = 'all' OR la.week_parity = $2)
ORDER BY la.day_of_week, la.slot_number;

-- name: GetEmptyClassroomsRadar :many
SELECT 
    c.id,
    c.building,
    c.room,
    c.floor,
    c.has_outlets,
    c.is_quiet_zone,
    c.capacity
FROM classrooms c
WHERE c.building = $1
  AND ($2 = FALSE OR c.has_outlets = TRUE)
  AND ($3 = FALSE OR c.is_quiet_zone = TRUE)
  AND c.id NOT IN (
      SELECT la.classroom_id 
      FROM lesson_assignments la 
      WHERE la.day_of_week = $4 
        AND la.slot_number = $5
        AND la.is_cancelled = FALSE
        AND (la.week_parity = 'all' OR la.week_parity = $6)
  )
ORDER BY c.floor, c.room;

-- name: UpsertLessonAssignment :one
INSERT INTO lesson_assignments (
    group_id, lesson_id, teacher_id, classroom_id,
    slot_number, start_time, end_time, day_of_week,
    week_parity, subgroup, is_cancelled
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
)
ON CONFLICT (id) DO UPDATE SET
    classroom_id = EXCLUDED.classroom_id,
    is_cancelled = EXCLUDED.is_cancelled,
    updated_at = NOW()
RETURNING id, updated_at;
