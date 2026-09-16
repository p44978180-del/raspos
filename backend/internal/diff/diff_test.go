package diff

import (
	"testing"
	"time"

	"timacad-backend/internal/domain"
)

func TestComputeGlobalHashDeterministic(t *testing.T) {
	groups := map[string]domain.ScheduleResponse{
		"ДА 01-26": {
			GroupID:   1,
			GroupName: "ДА 01-26",
			Schedule: []domain.DaySchedule{
				{
					DayOfWeek: 1,
					Weekday:   "Понедельник",
					Classes: []domain.ScheduleItem{
						{ID: 1, SlotNumber: 1, Subject: "Ботаника", LessonType: "lecture"},
					},
				},
			},
		},
	}

	h1 := ComputeGlobalHash(groups)
	h2 := ComputeGlobalHash(groups)

	if h1 == "" || h1 != h2 {
		t.Fatalf("expected deterministic non-empty hash, got %s vs %s", h1, h2)
	}
}

func TestCompareSnapshotsNoChanges(t *testing.T) {
	groups := map[string]domain.ScheduleResponse{
		"ДА 01-26": {
			GroupID:   1,
			GroupName: "ДА 01-26",
			Schedule: []domain.DaySchedule{
				{DayOfWeek: 1, Weekday: "Понедельник", Classes: []domain.ScheduleItem{{ID: 1, Subject: "Ботаника"}}},
			},
		},
	}

	res := CompareSnapshots(groups, groups, nil)
	if res.HasChanges {
		t.Errorf("expected HasChanges=false, got true")
	}
	if len(res.ChangedGroupNames) != 0 {
		t.Errorf("expected 0 changed groups, got %d", len(res.ChangedGroupNames))
	}
}

func TestCompareSnapshotsWithDelta(t *testing.T) {
	oldGroups := map[string]domain.ScheduleResponse{
		"ДА 01-26": {
			GroupID:   1,
			GroupName: "ДА 01-26",
			Schedule: []domain.DaySchedule{
				{DayOfWeek: 1, Weekday: "Понедельник", Classes: []domain.ScheduleItem{{ID: 1, Subject: "Ботаника"}}},
			},
		},
	}

	newGroups := map[string]domain.ScheduleResponse{
		"ДА 01-26": {
			GroupID:   1,
			GroupName: "ДА 01-26",
			Schedule: []domain.DaySchedule{
				{DayOfWeek: 1, Weekday: "Понедельник", Classes: []domain.ScheduleItem{
					{ID: 1, Subject: "Ботаника"},
					{ID: 2, Subject: "Агрономия"},
				}},
			},
		},
	}

	res := CompareSnapshots(oldGroups, newGroups, map[string]int{"ДА 01-26": 1})
	if !res.HasChanges {
		t.Fatalf("expected HasChanges=true, got false")
	}
	if len(res.ChangedGroupNames) != 1 || res.ChangedGroupNames[0] != "ДА 01-26" {
		t.Errorf("expected 'ДА 01-26' in changed groups, got %v", res.ChangedGroupNames)
	}
	if len(res.Deltas) != 1 {
		t.Errorf("expected 1 delta record, got %d", len(res.Deltas))
	}
}
