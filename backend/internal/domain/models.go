package domain

import "time"

// Core PostgreSQL Domain Entities matching strict relational schema

type Institute struct {
	ID      int    `json:"id"`
	Name    string `json:"name"`
	Courses []int  `json:"courses,omitempty"`
}

type Group struct {
	ID          int    `json:"id"`
	InstituteID int    `json:"institute_id"`
	Name        string `json:"name"`
	Course      int    `json:"course"`
	Degree      string `json:"degree"`
}

type Teacher struct {
	ID       int    `json:"id"`
	FullName string `json:"full_name"`
}

type Classroom struct {
	ID       int    `json:"id"`
	Building string `json:"building"`
	Room     string `json:"room"`
}

type Lesson struct {
	ID             int    `json:"id"`
	GroupID        int    `json:"group_id"`
	DayOfWeek      int    `json:"day_of_week"` // 1..7 (Monday..Sunday)
	SlotNumber     int    `json:"slot_number"` // 1..7
	WeekType       string `json:"week_type"`   // 'all', 'odd', 'even'
	SubjectName    string `json:"subject_name"`
	LessonType     string `json:"lesson_type"` // 'lecture', 'practice', 'lab', 'elective'
	SubgroupNumber *int   `json:"subgroup_number,omitempty"`
}

type LessonAssignment struct {
	LessonID    int `json:"lesson_id"`
	TeacherID   int `json:"teacher_id"`
	ClassroomID int `json:"classroom_id"`
}

// Aggregated View Models / DTOs for REST API & Redis Caching

type SubgroupDetail struct {
	Subgroup int    `json:"subgroup"`
	Teacher  string `json:"teacher"`
	Building string `json:"building"`
	Room     string `json:"room"`
}

type ScheduleItem struct {
	ID              int              `json:"id"`
	SlotNumber      int              `json:"num"`
	StartTime       string           `json:"start"`
	EndTime         string           `json:"end"`
	Subject         string           `json:"subject"`
	LessonType      string           `json:"type"`
	WeekType        string           `json:"weekType"`
	Teacher         string           `json:"teacher"`
	Building        string           `json:"building"`
	Room            string           `json:"room"`
	SubgroupNumber  *int             `json:"subgroup_number,omitempty"`
	Subgroups       []int            `json:"subgroups,omitempty"`
	SubgroupDetails []SubgroupDetail `json:"subgroupDetails,omitempty"`
}

type DaySchedule struct {
	DayOfWeek int            `json:"day_of_week"`
	Weekday   string         `json:"weekday"`
	Classes   []ScheduleItem `json:"classes"`
}

type ScheduleResponse struct {
	GroupID       int           `json:"group_id"`
	GroupName     string        `json:"group_name"`
	InstituteName string        `json:"institute_name"`
	Course        int           `json:"course"`
	Degree        string        `json:"degree"`
	Week          string        `json:"week"`
	Semester      int           `json:"semester"`
	Schedule      []DaySchedule `json:"schedule"`
}

type SyncTriggerResponse struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	JobID   string `json:"job_id,omitempty"`
}

type SyncStatusResponse struct {
	IsSyncing    bool       `json:"is_syncing"`
	JobID        string     `json:"job_id,omitempty"`
	LastSyncTime *time.Time `json:"last_sync_time,omitempty"`
	TotalGroups  int        `json:"total_groups"`
	TotalClasses int        `json:"total_classes"`
	LastStatus   string     `json:"last_status"`
	Message      string     `json:"message"`
}
