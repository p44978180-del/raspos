package usecase

import (
	"testing"
)

func TestBellSchedules(t *testing.T) {
	expected := map[int]struct {
		start string
		end   string
	}{
		1: {"08:30", "10:05"},
		2: {"10:20", "11:55"},
		3: {"12:25", "14:00"},
		4: {"14:15", "15:50"},
		5: {"16:05", "17:40"},
		6: {"17:55", "19:30"},
		7: {"19:45", "21:20"},
	}

	for slot, exp := range expected {
		b, ok := BellSchedules[slot]
		if !ok {
			t.Fatalf("missing BellSchedule for slot %d", slot)
		}
		if b.Start != exp.start || b.End != exp.end {
			t.Errorf("slot %d bell = (%q, %q); want (%q, %q)", slot, b.Start, b.End, exp.start, exp.end)
		}
	}
}

func TestWeekdayNames(t *testing.T) {
	expected := map[int]string{
		1: "Понедельник",
		2: "Вторник",
		3: "Среда",
		4: "Четверг",
		5: "Пятница",
		6: "Суббота",
		7: "Воскресенье",
	}

	if len(WeekdayNames) != 7 {
		t.Errorf("expected 7 weekdays including Sunday, got %d", len(WeekdayNames))
	}

	for day, name := range expected {
		if WeekdayNames[day] != name {
			t.Errorf("day %d name = %q; want %q", day, WeekdayNames[day], name)
		}
	}
}
