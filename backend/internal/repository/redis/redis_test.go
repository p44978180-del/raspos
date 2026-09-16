package redis

import (
	"testing"
)

func TestFormatKey(t *testing.T) {
	repo := &Repository{}

	tests := []struct {
		name     string
		groupID  int
		semester int
		week     string
		expected string
	}{
		{"Odd week", 42, 1, "odd", "schedule:group:42:sem:1:week:odd"},
		{"Even week", 42, 1, "even", "schedule:group:42:sem:1:week:even"},
		{"All week", 42, 1, "all", "schedule:group:42:sem:1:week:all"},
		{"Empty week defaults to all", 42, 1, "", "schedule:group:42:sem:1:week:all"},
		{"Invalid week defaults to all", 42, 1, "unknown", "schedule:group:42:sem:1:week:all"},
		{"Semester 2", 101, 2, "odd", "schedule:group:101:sem:2:week:odd"},
		{"Zero semester defaults to 1", 101, 0, "odd", "schedule:group:101:sem:1:week:odd"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := repo.FormatKey(tt.groupID, tt.semester, tt.week)
			if got != tt.expected {
				t.Errorf("FormatKey(%d, %d, %q) = %q; want %q", tt.groupID, tt.semester, tt.week, got, tt.expected)
			}
		})
	}
}
