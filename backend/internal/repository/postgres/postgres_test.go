package postgres

import (
	"testing"
)

func TestDeduceCourse(t *testing.T) {
	tests := []struct {
		name          string
		groupName     string
		defaultCourse int
		expected      int
	}{
		{"Year 26 is course 1", "ДА 01-26", 1, 1},
		{"Year 25 is course 2", "ДА 02-25", 1, 2},
		{"Year 24 is course 3", "Д-А 101-24", 1, 3},
		{"Year 23 is course 4", "Э-23", 1, 4},
		{"Year 22 is course 5", "М-22", 1, 5},
		{"Prefix 101 is course 1", "101", 1, 1},
		{"Prefix 205 is course 2", "205-А", 1, 2},
		{"Prefix 310 is course 3", "310", 1, 3},
		{"Prefix 404 is course 4", "404", 1, 4},
		{"Fallback default", "Агро-Спец", 3, 3},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := DeduceCourse(tt.groupName, tt.defaultCourse)
			if got != tt.expected {
				t.Errorf("DeduceCourse(%q, %d) = %d; want %d", tt.groupName, tt.defaultCourse, got, tt.expected)
			}
		})
	}
}

func TestWeekdayToDayNumber(t *testing.T) {
	tests := []struct {
		weekday  string
		expected int
	}{
		{"Понедельник", 1},
		{"Вторник", 2},
		{"Среда", 3},
		{"Четверг", 4},
		{"Пятница", 5},
		{"Суббота", 6},
		{"Воскресенье", 7},
		{"ПОНЕДЕЛЬНИК", 1},
		{"  среда  ", 3},
		{"Unknown", 1},
	}

	for _, tt := range tests {
		got := WeekdayToDayNumber(tt.weekday)
		if got != tt.expected {
			t.Errorf("WeekdayToDayNumber(%q) = %d; want %d", tt.weekday, got, tt.expected)
		}
	}
}

func TestTruncateRunes(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		maxRunes int
		expected string
	}{
		{
			name:     "Short string below limit",
			input:    "209",
			maxRunes: 50,
			expected: "209",
		},
		{
			name:     "String exactly at limit",
			input:    "12345678901234567890123456789012345678901234567890",
			maxRunes: 50,
			expected: "12345678901234567890123456789012345678901234567890",
		},
		{
			name:     "Long string above limit truncated",
			input:    "12345678901234567890123456789012345678901234567890EXTRA",
			maxRunes: 50,
			expected: "12345678901234567890123456789012345678901234567890",
		},
		{
			name:     "Group ДА 01-25 composite room with 58 runes truncated to 50 runes",
			input:    "209 / 122 / БАн / 329 / 311 / 201 / 101 / 310 / БП / 317",
			maxRunes: 50,
			expected: "209 / 122 / БАн / 329 / 311 / 201 / 101 / 310 / БП",
		},
		{
			name:     "Multi-byte Cyrillic teacher name truncated to 10 runes without byte corruption",
			input:    "Иванов Иван Иванович",
			maxRunes: 10,
			expected: "Иванов Ива",
		},
		{
			name:     "Empty string",
			input:    "",
			maxRunes: 50,
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := TruncateRunes(tt.input, tt.maxRunes)
			if got != tt.expected {
				t.Errorf("TruncateRunes(%q, %d) = %q; want %q", tt.input, tt.maxRunes, got, tt.expected)
			}
			if len([]rune(got)) > tt.maxRunes {
				t.Errorf("TruncateRunes result rune length %d > %d", len([]rune(got)), tt.maxRunes)
			}
		})
	}
}

