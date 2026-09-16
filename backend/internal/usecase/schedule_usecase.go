package usecase

import (
	"context"
	"encoding/json"
	"fmt"
	"sort"
	"strings"

	"timacad-backend/internal/domain"
	"timacad-backend/internal/repository/postgres"
	"timacad-backend/internal/repository/redis"
)

type BellTime struct {
	Start string
	End   string
}

var BellSchedules = map[int]BellTime{
	1: {Start: "08:30", End: "10:05"},
	2: {Start: "10:20", End: "11:55"},
	3: {Start: "12:25", End: "14:00"},
	4: {Start: "14:15", End: "15:50"},
	5: {Start: "16:05", End: "17:40"},
	6: {Start: "17:55", End: "19:30"},
	7: {Start: "19:45", End: "21:20"},
}

var WeekdayNames = map[int]string{
	1: "Понедельник",
	2: "Вторник",
	3: "Среда",
	4: "Четверг",
	5: "Пятница",
	6: "Суббота",
	7: "Воскресенье",
}

type ScheduleUseCase struct {
	pgRepo    *postgres.Repository
	redisRepo *redis.Repository
}

func NewScheduleUseCase(pgRepo *postgres.Repository, redisRepo *redis.Repository) *ScheduleUseCase {
	return &ScheduleUseCase{
		pgRepo:    pgRepo,
		redisRepo: redisRepo,
	}
}

// GetSchedule retrieves schedule with Redis cache checking and PostgreSQL fallback
// Returns (response, isCacheHit, error)
func (uc *ScheduleUseCase) GetSchedule(ctx context.Context, groupID int, weekType string, semester int) (*domain.ScheduleResponse, bool, error) {
	weekType = strings.ToLower(strings.TrimSpace(weekType))
	if weekType != "odd" && weekType != "even" && weekType != "all" {
		weekType = "all"
	}
	if semester < 1 {
		semester = 1
	}

	// 1. Check Redis Cache
	if uc.redisRepo != nil {
		cachedBytes, err := uc.redisRepo.GetSchedule(ctx, groupID, semester, weekType)
		if err == nil && len(cachedBytes) > 0 {
			var resp domain.ScheduleResponse
			if err := json.Unmarshal(cachedBytes, &resp); err == nil {
				return &resp, true, nil
			}
		}
	}

	// 2. Query PostgreSQL
	group, instituteName, err := uc.pgRepo.GetGroupByID(ctx, groupID)
	if err != nil {
		return nil, false, fmt.Errorf("failed to fetch group: %w", err)
	}
	if group == nil {
		return nil, false, fmt.Errorf("group with id %d not found", groupID)
	}

	rows, err := uc.pgRepo.GetScheduleRows(ctx, groupID, weekType)
	if err != nil {
		return nil, false, fmt.Errorf("failed to fetch schedule rows: %w", err)
	}

	// 3. Aggregate into day schedules
	// Map: dayOfWeek -> list of items
	type slotKey struct {
		slotNumber int
		subject    string
		weekType   string
	}

	daysMap := make(map[int]map[slotKey][]postgres.LessonDetailRow)
	for i := 1; i <= 7; i++ {
		daysMap[i] = make(map[slotKey][]postgres.LessonDetailRow)
	}

	for _, row := range rows {
		if row.DayOfWeek < 1 || row.DayOfWeek > 7 {
			continue
		}
		if _, ok := daysMap[row.DayOfWeek]; !ok {
			daysMap[row.DayOfWeek] = make(map[slotKey][]postgres.LessonDetailRow)
		}
		sk := slotKey{
			slotNumber: row.SlotNumber,
			subject:    row.SubjectName,
			weekType:   row.WeekType,
		}
		daysMap[row.DayOfWeek][sk] = append(daysMap[row.DayOfWeek][sk], row)
	}

	var daySchedules []domain.DaySchedule
	for dayNum := 1; dayNum <= 7; dayNum++ {
		slotsMap := daysMap[dayNum]
		var classes []domain.ScheduleItem

		// Sort slot keys by slot number
		var keys []slotKey
		for k := range slotsMap {
			keys = append(keys, k)
		}
		sort.Slice(keys, func(i, j int) bool {
			return keys[i].slotNumber < keys[j].slotNumber
		})

		for _, k := range keys {
			groupRows := slotsMap[k]
			if len(groupRows) == 0 {
				continue
			}

			firstRow := groupRows[0]
			bell, ok := BellSchedules[firstRow.SlotNumber]
			if !ok {
				bell = BellTime{Start: "08:30", End: "10:05"}
			}

			hasSubgroups := false
			for _, r := range groupRows {
				if r.SubgroupNumber != nil {
					hasSubgroups = true
					break
				}
			}

			if hasSubgroups {
				var subNums []int
				var subDetails []domain.SubgroupDetail
				var teachers []string
				var buildings []string
				var rooms []string

				teacherSeen := make(map[string]bool)
				buildingSeen := make(map[string]bool)
				roomSeen := make(map[string]bool)

				for _, r := range groupRows {
					sNum := 0
					if r.SubgroupNumber != nil {
						sNum = *r.SubgroupNumber
					}
					subNums = append(subNums, sNum)
					subDetails = append(subDetails, domain.SubgroupDetail{
						Subgroup: sNum,
						Teacher:  r.TeacherName,
						Building: r.Building,
						Room:     r.Room,
					})
					if r.TeacherName != "" && !teacherSeen[r.TeacherName] {
						teachers = append(teachers, r.TeacherName)
						teacherSeen[r.TeacherName] = true
					}
					if r.Building != "" && !buildingSeen[r.Building] {
						buildings = append(buildings, r.Building)
						buildingSeen[r.Building] = true
					}
					if r.Room != "" && !roomSeen[r.Room] {
						rooms = append(rooms, r.Room)
						roomSeen[r.Room] = true
					}
				}

				sort.Ints(subNums)
				sort.Slice(subDetails, func(a, b int) bool {
					return subDetails[a].Subgroup < subDetails[b].Subgroup
				})

				classes = append(classes, domain.ScheduleItem{
					ID:              firstRow.LessonID,
					SlotNumber:      firstRow.SlotNumber,
					StartTime:       bell.Start,
					EndTime:         bell.End,
					Subject:         firstRow.SubjectName,
					LessonType:      firstRow.LessonType,
					WeekType:        firstRow.WeekType,
					Teacher:         strings.Join(teachers, " / "),
					Building:        strings.Join(buildings, " / "),
					Room:            strings.Join(rooms, " / "),
					Subgroups:       subNums,
					SubgroupDetails: subDetails,
				})
			} else {
				// Single class without subgroups
				classes = append(classes, domain.ScheduleItem{
					ID:         firstRow.LessonID,
					SlotNumber: firstRow.SlotNumber,
					StartTime:  bell.Start,
					EndTime:    bell.End,
					Subject:    firstRow.SubjectName,
					LessonType: firstRow.LessonType,
					WeekType:   firstRow.WeekType,
					Teacher:    firstRow.TeacherName,
					Building:   firstRow.Building,
					Room:       firstRow.Room,
				})
			}
		}

		daySchedules = append(daySchedules, domain.DaySchedule{
			DayOfWeek: dayNum,
			Weekday:   WeekdayNames[dayNum],
			Classes:   classes,
		})
	}

	response := &domain.ScheduleResponse{
		GroupID:       group.ID,
		GroupName:     group.Name,
		InstituteName: instituteName,
		Course:        group.Course,
		Degree:        group.Degree,
		Week:          weekType,
		Semester:      semester,
		Schedule:      daySchedules,
	}

	// 4. Cache in Redis
	if uc.redisRepo != nil {
		if jsonBytes, err := json.Marshal(response); err == nil {
			_ = uc.redisRepo.SetSchedule(ctx, groupID, semester, weekType, jsonBytes)
		}
	}

	return response, false, nil
}
