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

// --- SuperApp Radar: Empty Classroom Models ---

type EmptyClassroom struct {
	ClassroomID     int    `json:"classroom_id"`
	Building        string `json:"building"`
	Room            string `json:"room"`
	Floor           int    `json:"floor"`
	Capacity        int    `json:"capacity"`
	HasPowerSockets bool   `json:"has_power_sockets"`
	IsQuietZone     bool   `json:"is_quiet_zone"`
	Status          string `json:"status"` // "free_now", "free_until_next_slot"
}

type EmptyClassroomsResponse struct {
	Building   string           `json:"building"`
	DayOfWeek  int              `json:"day_of_week"`
	SlotNumber int              `json:"slot_number"`
	Classrooms []EmptyClassroom `json:"classrooms"`
	TotalEmpty int              `json:"total_empty"`
}

// --- SuperApp Matchmaking: Windows Synchronization Models ---

type MatchWindowsQuery struct {
	GroupIDs  []int  `json:"group_ids"`
	DayOfWeek int    `json:"day_of_week"`
	WeekType  string `json:"week_type"`
}

type SharedWindowSlot struct {
	DayOfWeek               int      `json:"day_of_week"`
	Weekday                 string   `json:"weekday"`
	SlotNumber              int      `json:"slot_number"`
	StartTime               string   `json:"start_time"`
	EndTime                 string   `json:"end_time"`
	DurationMinutes         int      `json:"duration_minutes"`
	ParticipatingGroupNames []string `json:"participating_group_names"`
	SuggestedMeetupSpot     string   `json:"suggested_meetup_spot"`
	WalkMinutesToSpot       int      `json:"walk_minutes_to_spot"`
}

type MatchWindowsResponse struct {
	SharedWindows      []SharedWindowSlot `json:"shared_windows"`
	TotalSharedWindows int                `json:"total_shared_windows"`
}

// --- SuperApp Navigation: Campus Transit Graph Models ---

type CampusTransitRoute struct {
	FromBuilding           string   `json:"from_building"`
	ToBuilding             string   `json:"to_building"`
	WalkingDurationMinutes int      `json:"walking_duration_minutes"`
	DistanceMeters         int      `json:"distance_meters"`
	PathWaypoints          []string `json:"path_waypoints"`
	IsTightWindow          bool     `json:"is_tight_window"`
	UrgentWarning          string   `json:"urgent_warning,omitempty"`
	WeatherAdvisory        string   `json:"weather_advisory,omitempty"`
}

// --- SuperApp Crowdsourcing: Peer & Deputy Headstudent Confirmation ---

type CrowdsourceProposal struct {
	ID                         int64     `json:"id"`
	LessonID                   int       `json:"lesson_id"`
	GroupID                    int       `json:"group_id"`
	StudentName                string    `json:"student_name"`
	StudentRole                string    `json:"student_role"` // "student", "deputy_headstudent", "headstudent"
	ChangeType                 string    `json:"change_type"`  // "cancellation", "transfer", "room_change"
	TargetDayOfWeek            *int      `json:"target_day_of_week,omitempty"`
	TargetSlotNumber           *int      `json:"target_slot_number,omitempty"`
	TargetBuilding             *string   `json:"target_building,omitempty"`
	TargetRoom                 *string   `json:"target_room,omitempty"`
	Reason                     string    `json:"reason"`
	PeerVotes                  int       `json:"peer_votes"`
	HasDeputyConfirmation      bool      `json:"has_deputy_confirmation"`
	HasHeadstudentConfirmation bool      `json:"has_headstudent_confirmation"`
	Status                     string    `json:"status"` // "pending", "peer_confirmed", "officially_confirmed", "rejected"
	DisplayBadge               string    `json:"display_badge"`
	CreatedAt                  time.Time `json:"created_at"`
	UpdatedAt                  time.Time `json:"updated_at"`
}

type CrowdsourceVote struct {
	ProposalID  int64     `json:"proposal_id"`
	StudentName string    `json:"student_name"`
	StudentRole string    `json:"student_role"`
	VoteConfirm bool      `json:"vote_confirm"`
	CreatedAt   time.Time `json:"created_at"`
}

// --- Pipeline: S3 Snapshot & Diff Engine Models ---

type ScheduleSnapshot struct {
	ID           int64     `json:"id"`
	SnapshotHash string    `json:"snapshot_hash"`
	SourceURL    string    `json:"source_url"`
	DataFormat   string    `json:"data_format"`
	ByteSize     int64     `json:"byte_size"`
	StoragePath  string    `json:"storage_path"`
	CreatedAt    time.Time `json:"created_at"`
}

type ScheduleDelta struct {
	DetectedAt   time.Time `json:"detected_at"`
	GroupID      int       `json:"group_id"`
	ChangeType   string    `json:"change_type"`
	PreviousHash string    `json:"previous_hash"`
	CurrentHash  string    `json:"current_hash"`
	DetailsJSON  string    `json:"details_json"`
}

// Realtime SSE / WebSocket Event
type RealtimeScheduleEvent struct {
	EventID     string `json:"event_id"`
	EventType   string `json:"event_type"` // "PROPOSAL_CREATED", "PEER_VOTE_ADDED", "TRANSFER_CONFIRMED", "SYNC_COMPLETED"
	GroupID     int    `json:"group_id"`
	PayloadJSON string `json:"payload_json"`
	Timestamp   string `json:"timestamp"`
}

