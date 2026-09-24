package v4

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"raspos/platform/server/internal/canonical"
)

func TestCatalogCountsAndGoldenHash(t *testing.T) {
	public := findPublic(t)
	catalog, err := LoadCatalog(public)
	if err != nil {
		t.Fatal(err)
	}
	if catalog.Meta.TotalGroups != 805 {
		t.Fatalf("groups = %d", catalog.Meta.TotalGroups)
	}
	total := 0
	var golden []canonical.Lesson
	for _, group := range catalog.Groups {
		lessons, _, err := LoadLessons(public, group)
		if err != nil {
			t.Fatal(err)
		}
		total += len(lessons)
		if group.Code == "Д-А401" {
			golden = lessons
		}
	}
	if total != 47068 || total != catalog.Meta.TotalClasses {
		t.Fatalf("classes = %d, meta = %d", total, catalog.Meta.TotalClasses)
	}
	if len(golden) != 73 {
		t.Fatalf("Д-А401 lessons = %d", len(golden))
	}
	got := canonical.Hash(golden)
	expected, err := os.ReadFile(filepath.Join(findPlatform(t), "testdata", "group-da401.sha256"))
	if err != nil {
		t.Fatal(err)
	}
	if got != string(trim(expected)) {
		t.Fatalf("hash %s", got)
	}
}

func TestHashVectorMatchesRust(t *testing.T) {
	raw, err := os.ReadFile(filepath.Join(findPlatform(t), "testdata", "hash-vector.json"))
	if err != nil {
		t.Fatal(err)
	}
	var rows []map[string]string
	if err := json.Unmarshal(raw, &rows); err != nil {
		t.Fatal(err)
	}
	lessons := make([]canonical.Lesson, len(rows))
	for i, row := range rows {
		lessons[i] = canonical.Lesson{
			OccursOn: row["occurs_on"], StartsAt: row["starts_at"], EndsAt: row["ends_at"],
			Subject: row["subject"], Kind: row["kind"], Teacher: row["teacher"],
			Building: row["building"], Room: row["room"], WeekType: row["week_type"], SourceURL: row["source_url"],
		}
	}
	expected, err := os.ReadFile(filepath.Join(findPlatform(t), "testdata", "hash-vector.sha256"))
	if err != nil {
		t.Fatal(err)
	}
	if canonical.Hash(lessons) != string(trim(expected)) {
		t.Fatalf("hash %s", canonical.Hash(lessons))
	}
}

func findPublic(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for range 8 {
		candidate := filepath.Join(dir, "public", "data", "official-schedule.json")
		if _, err := os.Stat(candidate); err == nil {
			return filepath.Join(dir, "public")
		}
		dir = filepath.Dir(dir)
	}
	t.Fatal("public/data/official-schedule.json not found")
	return ""
}

func findPlatform(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for range 8 {
		candidate := filepath.Join(dir, "testdata", "hash-vector.sha256")
		if _, err := os.Stat(candidate); err == nil {
			return dir
		}
		dir = filepath.Dir(dir)
	}
	t.Fatal("platform testdata not found")
	return ""
}

func trim(b []byte) []byte {
	for len(b) > 0 && (b[len(b)-1] == '\n' || b[len(b)-1] == '\r') {
		b = b[:len(b)-1]
	}
	return b
}
