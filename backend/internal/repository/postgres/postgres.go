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
