package postgres

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"timacad-backend/internal/domain"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed schema.sql
var schemaSQL string

var (
	reYearSuffix   = regexp.MustCompile(`[-–]\s*(\d{2})\b`)
	reCoursePrefix = regexp.MustCompile(`\b([1-6])\d{2}\b`)
)

type LessonDetailRow struct {
	LessonID       int
	GroupID        int
	DayOfWeek      int
	SlotNumber     int
	WeekType       string
	SubjectName    string
	LessonType     string
	SubgroupNumber *int
	TeacherName    string
	Building       string
	Room           string
}

type Repository struct {
	pool *pgxpool.Pool
	mu   sync.RWMutex
}

func New(ctx context.Context, databaseURL string) (*Repository, error) {
	config, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("failed to parse database config: %w", err)
	}

	config.MaxConns = 25
	config.MinConns = 5
	config.MaxConnLifetime = 30 * time.Minute
	config.MaxConnIdleTime = 5 * time.Minute

	var pool *pgxpool.Pool
	var connErr error

	// Retry connection with exponential backoff for up to 30 seconds
	for i := 0; i < 10; i++ {
		pool, connErr = pgxpool.NewWithConfig(ctx, config)
		if connErr == nil {
			if pingErr := pool.Ping(ctx); pingErr == nil {
				log.Println("[Postgres] Successfully connected to PostgreSQL")
				return &Repository{pool: pool}, nil
			}
		}
		time.Sleep(time.Duration(1<<i*100) * time.Millisecond)
	}

	return nil, fmt.Errorf("could not connect to postgres after retries: %w", connErr)
}

func (r *Repository) Close() {
	if r.pool != nil {
		r.pool.Close()
	}
}

func (r *Repository) Pool() *pgxpool.Pool {
	return r.pool
}

// RunMigrations executes the DDL schema
func (r *Repository) RunMigrations(ctx context.Context) error {
	log.Println("[Postgres] Applying schema migrations...")
	_, err := r.pool.Exec(ctx, schemaSQL)
	if err != nil {
		return fmt.Errorf("failed to apply migrations: %w", err)
	}
	log.Println("[Postgres] Schema migrations successfully applied")
	return nil
}

// CountGroups returns the count of groups in the database
func (r *Repository) CountGroups(ctx context.Context) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, "SELECT COUNT(*) FROM groups").Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

// CountClasses returns the total count of lessons in the database
func (r *Repository) CountClasses(ctx context.Context) (int, error) {
	var count int
	err := r.pool.QueryRow(ctx, "SELECT COUNT(*) FROM lessons").Scan(&count)
	if err != nil {
		return 0, err
	}
	return count, nil
}

// GetInstitutesWithCourses returns all institutes along with their available courses
func (r *Repository) GetInstitutesWithCourses(ctx context.Context) ([]domain.Institute, error) {
	query := `
		SELECT i.id, i.name, COALESCE(array_agg(DISTINCT g.course ORDER BY g.course), '{}') AS courses
		FROM institutes i
		LEFT JOIN groups g ON i.id = g.institute_id
		GROUP BY i.id, i.name
		ORDER BY i.name ASC;
	`
	rows, err := r.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("failed to query institutes: %w", err)
	}
	defer rows.Close()

	var institutes []domain.Institute
	for rows.Next() {
		var inst domain.Institute
		var courses []int64
		if err := rows.Scan(&inst.ID, &inst.Name, &courses); err != nil {
			return nil, fmt.Errorf("failed to scan institute row: %w", err)
		}
		inst.Courses = make([]int, len(courses))
		for i, c := range courses {
			inst.Courses[i] = int(c)
		}
		institutes = append(institutes, inst)
	}
	if institutes == nil {
		institutes = []domain.Institute{}
	}
	return institutes, nil
}

// GetGroups returns groups filtered by optional institute_id and course
func (r *Repository) GetGroups(ctx context.Context, instituteID *int, course *int) ([]domain.Group, error) {
	query := "SELECT id, institute_id, name, course, degree FROM groups WHERE 1=1"
	var args []any
	argIdx := 1

	if instituteID != nil {
		query += fmt.Sprintf(" AND institute_id = $%d", argIdx)
		args = append(args, *instituteID)
		argIdx++
	}
	if course != nil {
		query += fmt.Sprintf(" AND course = $%d", argIdx)
		args = append(args, *course)
		argIdx++
	}
	query += " ORDER BY name ASC"

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query groups: %w", err)
	}
	defer rows.Close()

	var groups []domain.Group
	for rows.Next() {
		var g domain.Group
		if err := rows.Scan(&g.ID, &g.InstituteID, &g.Name, &g.Course, &g.Degree); err != nil {
			return nil, fmt.Errorf("failed to scan group row: %w", err)
		}
		groups = append(groups, g)
	}
	if groups == nil {
		groups = []domain.Group{}
	}
	return groups, nil
}

// GetGroupByID returns a single group and its institute name
func (r *Repository) GetGroupByID(ctx context.Context, id int) (*domain.Group, string, error) {
	query := `
		SELECT g.id, g.institute_id, g.name, g.course, g.degree, COALESCE(i.name, '')
		FROM groups g
		LEFT JOIN institutes i ON g.institute_id = i.id
		WHERE g.id = $1
	`
	var g domain.Group
	var instituteName string
	err := r.pool.QueryRow(ctx, query, id).Scan(&g.ID, &g.InstituteID, &g.Name, &g.Course, &g.Degree, &instituteName)
	if err != nil {
		if err == pgx.ErrNoRows {
			return nil, "", nil
		}
		return nil, "", fmt.Errorf("failed to query group by id: %w", err)
	}
	return &g, instituteName, nil
}

// GetScheduleRows returns raw lesson rows with teacher and classroom joins
func (r *Repository) GetScheduleRows(ctx context.Context, groupID int, weekType string) ([]LessonDetailRow, error) {
	query := `
		SELECT 
			l.id,
			l.group_id,
			l.day_of_week,
			l.slot_number,
			l.week_type,
			l.subject_name,
			l.lesson_type,
			l.subgroup_number,
			COALESCE(t.full_name, '') AS teacher_name,
			COALESCE(c.building, '') AS building,
			COALESCE(c.room, '') AS room
		FROM lessons l
		LEFT JOIN lesson_assignments la ON l.id = la.lesson_id
		LEFT JOIN teachers t ON la.teacher_id = t.id
		LEFT JOIN classrooms c ON la.classroom_id = c.id
		WHERE l.group_id = $1
	`
	var args []any
	args = append(args, groupID)

	if weekType == "odd" {
		query += " AND l.week_type IN ('odd', 'all')"
	} else if weekType == "even" {
		query += " AND l.week_type IN ('even', 'all')"
	}

	query += " ORDER BY l.day_of_week ASC, l.slot_number ASC, l.subgroup_number ASC NULLS FIRST, l.id ASC;"

	rows, err := r.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to query schedule rows: %w", err)
	}
	defer rows.Close()

	var result []LessonDetailRow
	for rows.Next() {
		var row LessonDetailRow
		err := rows.Scan(
			&row.LessonID,
			&row.GroupID,
			&row.DayOfWeek,
			&row.SlotNumber,
			&row.WeekType,
			&row.SubjectName,
			&row.LessonType,
			&row.SubgroupNumber,
			&row.TeacherName,
			&row.Building,
			&row.Room,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan schedule detail row: %w", err)
		}
		result = append(result, row)
	}
	return result, nil
}

// Course deduction heuristic
func DeduceCourse(name string, defaultCourse int) int {
	if m := reYearSuffix.FindStringSubmatch(name); len(m) > 1 {
		yr, err := strconv.Atoi(m[1])
		if err == nil && yr >= 20 && yr <= 27 {
			c := 27 - yr
			if c >= 1 && c <= 6 {
				return c
			}
		}
	}
	if m := reCoursePrefix.FindStringSubmatch(name); len(m) > 1 {
		c, err := strconv.Atoi(m[1])
		if err == nil && c >= 1 && c <= 6 {
			return c
		}
	}
	if defaultCourse >= 1 && defaultCourse <= 6 {
		return defaultCourse
	}
	return 1
}

// TruncateRunes defensively limits a string to at most maxRunes Unicode runes
// to guarantee PostgreSQL VARCHAR(N) limit compliance (preventing SQLSTATE 22001).
func TruncateRunes(s string, maxRunes int) string {
	r := []rune(s)
	if len(r) > maxRunes {
		return string(r[:maxRunes])
	}
	return s
}

// Ingestion structures matching public/data/official-schedule.json
type RawSubgroupDetail struct {
	Subgroup int    `json:"subgroup"`
	Teacher  string `json:"teacher"`
	Building string `json:"building"`
	Room     string `json:"room"`
}

type RawClassItem struct {
	ID              int                 `json:"id"`
	Num             int                 `json:"num"`
	Start           string              `json:"start"`
	End             string              `json:"end"`
	Subject         string              `json:"subject"`
	Type            string              `json:"type"`
	Teacher         string              `json:"teacher"`
	Building        string              `json:"building"`
	Room            string              `json:"room"`
	WeekType        string              `json:"weekType"`
	Subgroups       []int               `json:"subgroups"`
	SubgroupDetails []RawSubgroupDetail `json:"subgroupDetails"`
}

type RawDaySchedule struct {
	Weekday string         `json:"weekday"`
	Classes []RawClassItem `json:"classes"`
}

type RawGroupData struct {
	Institute      string           `json:"institute"`
	Course         int              `json:"course"`
	Level          string           `json:"level"`
	OfficialPdfURL string           `json:"officialPdfUrl"`
	Schedule       []RawDaySchedule `json:"schedule"`
}

type RawScheduleFile struct {
	Metadata map[string]any          `json:"metadata"`
	Groups   map[string]RawGroupData `json:"groups"`
}

func WeekdayToDayNumber(weekday string) int {
	switch strings.ToLower(strings.TrimSpace(weekday)) {
	case "понедельник":
		return 1
	case "вторник":
		return 2
	case "среда":
		return 3
	case "четверг":
		return 4
	case "пятница":
		return 5
	case "суббота":
		return 6
	case "воскресенье":
		return 7
	default:
		return 1
	}
}

// IngestJSON parses the raw official-schedule.json bytes and imports into PostgreSQL transactionally
func (r *Repository) IngestJSON(ctx context.Context, jsonData []byte) (int, int, error) {
	var rawFile RawScheduleFile
	if err := json.Unmarshal(jsonData, &rawFile); err != nil {
		return 0, 0, fmt.Errorf("failed to unmarshal schedule json: %w", err)
	}

	tx, err := r.pool.Begin(ctx)
	if err != nil {
		return 0, 0, fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback(ctx)

	// In-memory caches for fast FK lookups during batch
	instituteMap := make(map[string]int)
	teacherMap := make(map[string]int)
	classroomMap := make(map[string]int) // "building:::room" -> id

	// 1. Preload existing entities
	instRows, err := tx.Query(ctx, "SELECT id, name FROM institutes")
	if err == nil {
		for instRows.Next() {
			var id int
			var name string
			if instRows.Scan(&id, &name) == nil {
				instituteMap[name] = id
			}
		}
		instRows.Close()
	}

	tRows, err := tx.Query(ctx, "SELECT id, full_name FROM teachers")
	if err == nil {
		for tRows.Next() {
			var id int
			var name string
			if tRows.Scan(&id, &name) == nil {
				teacherMap[name] = id
			}
		}
		tRows.Close()
	}

	cRows, err := tx.Query(ctx, "SELECT id, building, room FROM classrooms")
	if err == nil {
		for cRows.Next() {
			var id int
			var building, room string
			if cRows.Scan(&id, &building, &room) == nil {
				classroomMap[building+":::"+room] = id
			}
		}
		cRows.Close()
	}

	getOrCreateInstitute := func(name string) (int, error) {
		name = strings.TrimSpace(name)
		if name == "" {
			name = "Общеуниверситетские кафедры"
		}
		name = TruncateRunes(name, 255)
		if id, ok := instituteMap[name]; ok {
			return id, nil
		}
		var id int
		err := tx.QueryRow(ctx, `
			INSERT INTO institutes (name) VALUES ($1)
			ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
			RETURNING id
		`, name).Scan(&id)
		if err != nil {
			return 0, err
		}
		instituteMap[name] = id
		return id, nil
	}

	getOrCreateTeacher := func(name string) (int, error) {
		name = strings.TrimSpace(name)
		if name == "" {
			name = "Кафедра"
		}
		name = TruncateRunes(name, 150)
		if id, ok := teacherMap[name]; ok {
			return id, nil
		}
		var id int
		err := tx.QueryRow(ctx, `
			INSERT INTO teachers (full_name) VALUES ($1)
			ON CONFLICT (full_name) DO UPDATE SET full_name = EXCLUDED.full_name
			RETURNING id
		`, name).Scan(&id)
		if err != nil {
			return 0, err
		}
		teacherMap[name] = id
		return id, nil
	}

	getOrCreateClassroom := func(building, room string) (int, error) {
		building = strings.TrimSpace(building)
		room = strings.TrimSpace(room)
		if building == "" {
			building = "Не указан"
		}
		if room == "" {
			room = "—"
		}
		building = TruncateRunes(building, 50)
		room = TruncateRunes(room, 50)
		key := building + ":::" + room
		if id, ok := classroomMap[key]; ok {
			return id, nil
		}
		var id int
		err := tx.QueryRow(ctx, `
			INSERT INTO classrooms (building, room) VALUES ($1, $2)
			ON CONFLICT (building, room) DO UPDATE SET building = EXCLUDED.building
			RETURNING id
		`, building, room).Scan(&id)
		if err != nil {
			return 0, err
		}
		classroomMap[key] = id
		return id, nil
	}

	totalGroups := 0
	totalClasses := 0

	for groupName, groupData := range rawFile.Groups {
		groupName = strings.TrimSpace(groupName)
		if groupName == "" {
			continue
		}
		groupName = TruncateRunes(groupName, 50)

		instID, err := getOrCreateInstitute(groupData.Institute)
		if err != nil {
			return 0, 0, fmt.Errorf("failed to get/create institute %q: %w", groupData.Institute, err)
		}

		course := DeduceCourse(groupName, groupData.Course)
		degree := strings.TrimSpace(groupData.Level)
		if degree == "" {
			degree = "Бакалавриат"
		}
		degree = TruncateRunes(degree, 20)

		var groupID int
		err = tx.QueryRow(ctx, `
			INSERT INTO groups (institute_id, name, course, degree)
			VALUES ($1, $2, $3, $4)
			ON CONFLICT (name) DO UPDATE SET
				institute_id = EXCLUDED.institute_id,
				course = EXCLUDED.course,
				degree = EXCLUDED.degree
			RETURNING id
		`, instID, groupName, course, degree).Scan(&groupID)
		if err != nil {
			return 0, 0, fmt.Errorf("failed to upsert group %q: %w", groupName, err)
		}
		totalGroups++

		// Clean old lessons for this group to ensure clean replacement
		_, err = tx.Exec(ctx, "DELETE FROM lessons WHERE group_id = $1", groupID)
		if err != nil {
			return 0, 0, fmt.Errorf("failed to clear old lessons for group %d: %w", groupID, err)
		}

		for _, day := range groupData.Schedule {
			dayOfWeek := WeekdayToDayNumber(day.Weekday)
			for _, cls := range day.Classes {
				totalClasses++
				slotNumber := cls.Num
				if slotNumber < 1 {
					slotNumber = 1
				}
				weekType := strings.ToLower(strings.TrimSpace(cls.WeekType))
				if weekType != "odd" && weekType != "even" && weekType != "all" {
					weekType = "all"
				}
				subjectName := strings.TrimSpace(cls.Subject)
				if subjectName == "" {
					subjectName = "Занятие"
				}
				subjectName = TruncateRunes(subjectName, 255)
				lessonType := strings.TrimSpace(cls.Type)
				if lessonType == "" {
					lessonType = "practice"
				}
				lessonType = TruncateRunes(lessonType, 50)

				if len(cls.SubgroupDetails) > 0 {
					for _, sd := range cls.SubgroupDetails {
						subgroupNum := sd.Subgroup
						var lessonID int
						err := tx.QueryRow(ctx, `
							INSERT INTO lessons (group_id, day_of_week, slot_number, week_type, subject_name, lesson_type, subgroup_number)
							VALUES ($1, $2, $3, $4, $5, $6, $7)
							RETURNING id
						`, groupID, dayOfWeek, slotNumber, weekType, subjectName, lessonType, subgroupNum).Scan(&lessonID)
						if err != nil {
							return 0, 0, fmt.Errorf("failed to insert lesson: %w", err)
						}

						tID, err := getOrCreateTeacher(sd.Teacher)
						if err != nil {
							return 0, 0, err
						}
						cID, err := getOrCreateClassroom(sd.Building, sd.Room)
						if err != nil {
							return 0, 0, err
						}

						_, err = tx.Exec(ctx, `
							INSERT INTO lesson_assignments (lesson_id, teacher_id, classroom_id)
							VALUES ($1, $2, $3)
							ON CONFLICT DO NOTHING
						`, lessonID, tID, cID)
						if err != nil {
							return 0, 0, fmt.Errorf("failed to insert lesson assignment: %w", err)
						}
					}
				} else {
					var lessonID int
					err := tx.QueryRow(ctx, `
						INSERT INTO lessons (group_id, day_of_week, slot_number, week_type, subject_name, lesson_type, subgroup_number)
						VALUES ($1, $2, $3, $4, $5, $6, NULL)
						RETURNING id
					`, groupID, dayOfWeek, slotNumber, weekType, subjectName, lessonType).Scan(&lessonID)
					if err != nil {
						return 0, 0, fmt.Errorf("failed to insert lesson: %w", err)
					}

					tID, err := getOrCreateTeacher(cls.Teacher)
					if err != nil {
						return 0, 0, err
					}
					cID, err := getOrCreateClassroom(cls.Building, cls.Room)
					if err != nil {
						return 0, 0, err
					}

					_, err = tx.Exec(ctx, `
						INSERT INTO lesson_assignments (lesson_id, teacher_id, classroom_id)
						VALUES ($1, $2, $3)
						ON CONFLICT DO NOTHING
					`, lessonID, tID, cID)
					if err != nil {
						return 0, 0, fmt.Errorf("failed to insert lesson assignment: %w", err)
					}
				}
			}
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, 0, fmt.Errorf("failed to commit transaction: %w", err)
	}

	log.Printf("[Postgres] Ingestion completed: %d groups and %d classes stored", totalGroups, totalClasses)
	return totalGroups, totalClasses, nil
}

// SeedIfEmpty checks if database has 0 groups, and if so seeds from given JSON data path
func (r *Repository) SeedIfEmpty(ctx context.Context, dataPath string) error {
	count, err := r.CountGroups(ctx)
	if err != nil {
		return fmt.Errorf("failed to check groups count: %w", err)
	}
	if count > 0 {
		log.Printf("[Postgres] Database already populated (%d groups). Skipping seed.", count)
		return nil
	}

	log.Printf("[Postgres] Database is empty. Attempting auto-seed from %s...", dataPath)

	candidatePaths := []string{
		dataPath,
		"../public/data/official-schedule.json",
		"public/data/official-schedule.json",
		"/app/public/data/official-schedule.json",
		"../../public/data/official-schedule.json",
	}

	var dataBytes []byte
	var foundPath string
	for _, p := range candidatePaths {
		if content, err := os.ReadFile(p); err == nil && len(content) > 0 {
			dataBytes = content
			foundPath = p
			break
		}
	}

	if len(dataBytes) == 0 {
		return fmt.Errorf("schedule seed file not found in candidates: %v", candidatePaths)
	}

	log.Printf("[Postgres] Loading seed data from %s (%d bytes)...", foundPath, len(dataBytes))
	groups, classes, err := r.IngestJSON(ctx, dataBytes)
	if err != nil {
		return fmt.Errorf("seeding failed: %w", err)
	}

	log.Printf("[Postgres] Seeding successful! Ingested %d groups and %d classes.", groups, classes)
	return nil
}

// GetEmptyClassrooms performs an inverted relational lookup to find rooms with no lessons assigned
func (r *Repository) GetEmptyClassrooms(
	ctx context.Context,
	building string,
	dayOfWeek int,
	slotNumber int,
	weekType string,
	sockets bool,
	quiet bool,
) ([]domain.EmptyClassroom, error) {
	query := `
		SELECT c.id, c.building, c.room
		FROM classrooms c
		WHERE ($1 = '' OR c.building ILIKE '%' || $1 || '%')
		  AND c.id NOT IN (
		    SELECT DISTINCT la.classroom_id
		    FROM lesson_assignments la
		    JOIN lessons l ON la.lesson_id = l.id
		    WHERE l.day_of_week = $2
		      AND l.slot_number = $3
		      AND ($4 = 'all' OR l.week_type = 'all' OR l.week_type = $4)
		  )
		ORDER BY c.room ASC
		LIMIT 40;
	`
	rows, err := r.pool.Query(ctx, query, building, dayOfWeek, slotNumber, weekType)
	if err != nil {
		return nil, fmt.Errorf("failed to query empty classrooms: %w", err)
	}
	defer rows.Close()

	var results []domain.EmptyClassroom
	for rows.Next() {
		var item domain.EmptyClassroom
		if err := rows.Scan(&item.ClassroomID, &item.Building, &item.Room); err != nil {
			continue
		}

		// Calculate floor from room digits
		item.Floor = 1
		for _, rChar := range item.Room {
			if rChar >= '1' && rChar <= '9' {
				item.Floor = int(rChar - '0')
				break
			}
		}

		// Classroom attributes heuristics
		item.Capacity = 30 + (item.ClassroomID%5)*15
		item.HasPowerSockets = (item.Floor >= 2) || (item.ClassroomID%2 == 0)
		item.IsQuietZone = (item.Floor >= 3) || strings.Contains(item.Room, "чит")
		item.Status = "free_now"

		if sockets && !item.HasPowerSockets {
			continue
		}
		if quiet && !item.IsQuietZone {
			continue
		}

		results = append(results, item)
	}

	if results == nil {
		results = []domain.EmptyClassroom{}
	}
	return results, nil
}

// MatchWindows finds overlapping free slots across two or more groups
func (r *Repository) MatchWindows(
	ctx context.Context,
	groupIDs []int,
	dayOfWeek int,
	weekType string,
) ([]domain.SharedWindowSlot, error) {
	if len(groupIDs) == 0 {
		return []domain.SharedWindowSlot{}, nil
	}

	bells := map[int][2]string{
		1: {"08:30", "10:05"},
		2: {"10:20", "11:55"},
		3: {"12:25", "14:00"},
		4: {"14:15", "15:50"},
		5: {"16:05", "17:40"},
		6: {"17:55", "19:30"},
		7: {"19:45", "21:20"},
	}

	weekdays := map[int]string{
		1: "Понедельник", 2: "Вторник", 3: "Среда",
		4: "Четверг", 5: "Пятница", 6: "Суббота", 7: "Воскресенье",
	}

	// Fetch group names
	groupNames := make(map[int]string)
	for _, gid := range groupIDs {
		g, _, _ := r.GetGroupByID(ctx, gid)
		if g != nil {
			groupNames[gid] = g.Name
		} else {
			groupNames[gid] = fmt.Sprintf("Группа #%d", gid)
		}
	}

	// Query busy slots for each group
	busyMap := make(map[int]map[int]bool) // groupID -> slotNumber -> isBusy
	for _, gid := range groupIDs {
		busyMap[gid] = make(map[int]bool)
		q := `
			SELECT slot_number
			FROM lessons
			WHERE group_id = $1 AND day_of_week = $2
			  AND ($3 = 'all' OR week_type = 'all' OR week_type = $3);
		`
		rows, err := r.pool.Query(ctx, q, gid, dayOfWeek, weekType)
		if err == nil {
			for rows.Next() {
				var s int
				if err := rows.Scan(&s); err == nil {
					busyMap[gid][s] = true
				}
			}
			rows.Close()
		}
	}

	spots := []string{
		"Столовая №2 (12-й корпус, 1 этаж)",
		"Студенческое кафе «Колос» (Лиственничная аллея)",
		"Коворкинг и кофейня (28-й Инженерный корпус)",
		"Центральная научная библиотека им. Железнова",
		"Зона отдыха у фонтана (Верхняя аллея)",
	}

	var shared []domain.SharedWindowSlot
	for slot := 1; slot <= 7; slot++ {
		allFree := true
		for _, gid := range groupIDs {
			if busyMap[gid][slot] {
				allFree = false
				break
			}
		}

		if allFree {
			bTimes := bells[slot]
			var names []string
			for _, gid := range groupIDs {
				names = append(names, groupNames[gid])
			}

			spotIdx := (dayOfWeek + slot) % len(spots)
			shared = append(shared, domain.SharedWindowSlot{
				DayOfWeek:               dayOfWeek,
				Weekday:                 weekdays[dayOfWeek],
				SlotNumber:              slot,
				StartTime:               bTimes[0],
				EndTime:                 bTimes[1],
				DurationMinutes:         95,
				ParticipatingGroupNames: names,
				SuggestedMeetupSpot:     spots[spotIdx],
				WalkMinutesToSpot:       3 + (slot % 4),
			})
		}
	}

	if shared == nil {
		shared = []domain.SharedWindowSlot{}
	}
	return shared, nil
}

// GetCampusRoute computes shortest path walking time between campus buildings
func (r *Repository) GetCampusRoute(fromBuilding, toBuilding string, windowMinutes int) domain.CampusTransitRoute {
	cleanFrom := strings.TrimSpace(fromBuilding)
	cleanTo := strings.TrimSpace(toBuilding)

	if cleanFrom == "" {
		cleanFrom = "1-й учебный корпус"
	}
	if cleanTo == "" {
		cleanTo = "28-й Инженерный корпус"
	}

	// Matrix of walk distances in meters between Timiryazevka campus sectors
	distanceMatrix := map[string]map[string]int{
		"1":  {"1": 0, "2": 250, "4": 400, "6": 650, "12": 800, "16": 900, "17": 1100, "28": 1400, "29": 1200, "СК": 1600},
		"2":  {"1": 250, "2": 0, "4": 200, "6": 450, "12": 600, "16": 700, "17": 900, "28": 1200, "29": 1000, "СК": 1400},
		"12": {"1": 800, "2": 600, "4": 500, "6": 300, "12": 0, "16": 350, "17": 450, "28": 750, "29": 650, "СК": 1000},
		"17": {"1": 1100, "2": 900, "4": 800, "6": 600, "12": 450, "16": 300, "17": 0, "28": 600, "29": 500, "СК": 850},
		"28": {"1": 1400, "2": 1200, "4": 1100, "6": 950, "12": 750, "16": 600, "17": 600, "28": 0, "29": 250, "СК": 500},
		"СК": {"1": 1600, "2": 1400, "4": 1300, "6": 1200, "12": 1000, "16": 850, "17": 850, "28": 500, "29": 450, "СК": 0},
	}

	extractNum := func(b string) string {
		if strings.Contains(b, "СК") || strings.Contains(b, "Спорт") {
			return "СК"
		}
		for _, token := range []string{"1", "2", "4", "6", "12", "16", "17", "28", "29"} {
			if strings.Contains(b, token) {
				return token
			}
		}
		return "1"
	}

	codeA := extractNum(cleanFrom)
	codeB := extractNum(cleanTo)

	meters := 600
	if m, ok := distanceMatrix[codeA][codeB]; ok && m > 0 {
		meters = m
	} else if codeA == codeB {
		meters = 50
	}

	// Average student walking speed: 80 meters/min (approx 4.8 km/h)
	walkMinutes := (meters + 79) / 80
	if walkMinutes < 2 {
		walkMinutes = 2
	}

	waypoints := []string{
		cleanFrom,
		"Лиственничная аллея",
		"Центральный сквер",
		cleanTo,
	}

	isTight := false
	var warning string
	if windowMinutes > 0 && walkMinutes > (windowMinutes-5) {
		isTight = true
		warning = fmt.Sprintf("Внимание: У вас окно %d мин, а переход между корпусами займет ~%d мин! Рекомендуем поторопиться.", windowMinutes, walkMinutes)
	}

	return domain.CampusTransitRoute{
		FromBuilding:           cleanFrom,
		ToBuilding:             cleanTo,
		WalkingDurationMinutes: walkMinutes,
		DistanceMeters:         meters,
		PathWaypoints:          waypoints,
		IsTightWindow:          isTight,
		UrgentWarning:          warning,
		WeatherAdvisory:        "Маршрут проходит по освещенным пешеходным дорожкам кампуса.",
	}
}

// ProposeCrowdsourceChange creates a peer proposal for a lesson transfer or cancellation
func (r *Repository) ProposeCrowdsourceChange(ctx context.Context, p *domain.CrowdsourceProposal) (*domain.CrowdsourceProposal, error) {
	p.CreatedAt = time.Now().UTC()
	p.UpdatedAt = p.CreatedAt
	p.PeerVotes = 1

	if p.StudentRole == "headstudent" {
		p.HasHeadstudentConfirmation = true
		p.Status = "officially_confirmed"
		p.DisplayBadge = "Официально подтверждено старостой"
	} else if p.StudentRole == "deputy_headstudent" {
		p.HasDeputyConfirmation = true
		p.Status = "peer_confirmed"
		p.DisplayBadge = "Подтверждено зам. старосты"
	} else {
		p.Status = "pending"
		p.DisplayBadge = "Проверяется одногруппниками (1/3)"
	}

	query := `
		INSERT INTO crowdsource_proposals (
			lesson_id, group_id, student_name, student_role, change_type,
			target_day_of_week, target_slot_number, target_building, target_room,
			reason, peer_votes, has_deputy_confirmation, has_headstudent_confirmation,
			status, display_badge, created_at, updated_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
		RETURNING id;
	`
	err := r.pool.QueryRow(ctx, query,
		p.LessonID, p.GroupID, p.StudentName, p.StudentRole, p.ChangeType,
		p.TargetDayOfWeek, p.TargetSlotNumber, p.TargetBuilding, p.TargetRoom,
		p.Reason, p.PeerVotes, p.HasDeputyConfirmation, p.HasHeadstudentConfirmation,
		p.Status, p.DisplayBadge, p.CreatedAt, p.UpdatedAt,
	).Scan(&p.ID)

	if err != nil {
		return nil, fmt.Errorf("failed to insert crowdsource proposal: %w", err)
	}

	// Register the author's initial vote
	_, _ = r.pool.Exec(ctx, `
		INSERT INTO crowdsource_votes (proposal_id, student_name, student_role, vote_confirm, created_at)
		VALUES ($1, $2, $3, TRUE, $4) ON CONFLICT DO NOTHING;
	`, p.ID, p.StudentName, p.StudentRole, p.CreatedAt)

	return p, nil
}

// VoteCrowdsourceChange records peer confirmation and handles the 3+ peer badge transition
func (r *Repository) VoteCrowdsourceChange(
	ctx context.Context,
	proposalID int64,
	studentName string,
	role string,
	confirm bool,
) (*domain.CrowdsourceProposal, error) {
	// 1. Insert vote
	_, err := r.pool.Exec(ctx, `
		INSERT INTO crowdsource_votes (proposal_id, student_name, student_role, vote_confirm, created_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (proposal_id, student_name) DO UPDATE
		SET vote_confirm = EXCLUDED.vote_confirm;
	`, proposalID, studentName, role, confirm)
	if err != nil {
		return nil, fmt.Errorf("failed to record vote: %w", err)
	}

	// 2. Count confirmations
	var confirmCount int
	_ = r.pool.QueryRow(ctx, `
		SELECT COUNT(*) FROM crowdsource_votes
		WHERE proposal_id = $1 AND vote_confirm = TRUE;
	`, proposalID).Scan(&confirmCount)

	// 3. Load proposal
	var p domain.CrowdsourceProposal
	err = r.pool.QueryRow(ctx, `
		SELECT id, lesson_id, group_id, student_name, student_role, change_type,
		       target_day_of_week, target_slot_number, target_building, target_room,
		       reason, peer_votes, has_deputy_confirmation, has_headstudent_confirmation,
		       status, display_badge, created_at, updated_at
		FROM crowdsource_proposals WHERE id = $1;
	`, proposalID).Scan(
		&p.ID, &p.LessonID, &p.GroupID, &p.StudentName, &p.StudentRole, &p.ChangeType,
		&p.TargetDayOfWeek, &p.TargetSlotNumber, &p.TargetBuilding, &p.TargetRoom,
		&p.Reason, &p.PeerVotes, &p.HasDeputyConfirmation, &p.HasHeadstudentConfirmation,
		&p.Status, &p.DisplayBadge, &p.CreatedAt, &p.UpdatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch proposal: %w", err)
	}

	p.PeerVotes = confirmCount

	// Business rule: Role effects
	if role == "headstudent" && confirm {
		p.HasHeadstudentConfirmation = true
		p.Status = "officially_confirmed"
		p.DisplayBadge = "Официально подтверждено старостой"
	} else if role == "deputy_headstudent" && confirm {
		p.HasDeputyConfirmation = true
		p.Status = "peer_confirmed"
	} else if p.PeerVotes >= 3 && p.Status != "officially_confirmed" && !p.HasDeputyConfirmation {
		// 3+ peer confirmation triggers "Возможен перенос" badge
		p.Status = "peer_confirmed"
		p.DisplayBadge = "Возможен перенос (подтверждено 3+ студентами)"
	} else if p.Status != "officially_confirmed" && !p.HasDeputyConfirmation {
		p.DisplayBadge = fmt.Sprintf("Проверяется одногруппниками (%d/3)", p.PeerVotes)
	}

	p.UpdatedAt = time.Now().UTC()

	_, err = r.pool.Exec(ctx, `
		UPDATE crowdsource_proposals
		SET peer_votes = $1, has_deputy_confirmation = $2, has_headstudent_confirmation = $3,
		    status = $4, display_badge = $5, updated_at = $6
		WHERE id = $7;
	`, p.PeerVotes, p.HasDeputyConfirmation, p.HasHeadstudentConfirmation, p.Status, p.DisplayBadge, p.UpdatedAt, p.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to update proposal: %w", err)
	}

	return &p, nil
}

// ListCrowdsourceProposals retrieves active proposals for a student group
func (r *Repository) ListCrowdsourceProposals(ctx context.Context, groupID int) ([]domain.CrowdsourceProposal, error) {
	query := `
		SELECT id, lesson_id, group_id, student_name, student_role, change_type,
		       target_day_of_week, target_slot_number, target_building, target_room,
		       reason, peer_votes, has_deputy_confirmation, has_headstudent_confirmation,
		       status, display_badge, created_at, updated_at
		FROM crowdsource_proposals
		WHERE group_id = $1
		ORDER BY created_at DESC;
	`
	rows, err := r.pool.Query(ctx, query, groupID)
	if err != nil {
		return nil, fmt.Errorf("failed to query proposals: %w", err)
	}
	defer rows.Close()

	var proposals []domain.CrowdsourceProposal
	for rows.Next() {
		var p domain.CrowdsourceProposal
		if err := rows.Scan(
			&p.ID, &p.LessonID, &p.GroupID, &p.StudentName, &p.StudentRole, &p.ChangeType,
			&p.TargetDayOfWeek, &p.TargetSlotNumber, &p.TargetBuilding, &p.TargetRoom,
			&p.Reason, &p.PeerVotes, &p.HasDeputyConfirmation, &p.HasHeadstudentConfirmation,
			&p.Status, &p.DisplayBadge, &p.CreatedAt, &p.UpdatedAt,
		); err == nil {
			proposals = append(proposals, p)
		}
	}

	if proposals == nil {
		proposals = []domain.CrowdsourceProposal{}
	}
	return proposals, nil
}

