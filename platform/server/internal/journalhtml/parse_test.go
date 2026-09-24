package journalhtml

import (
	"os"
	"path/filepath"
	"testing"
)

func TestSampleGroupFixture(t *testing.T) {
	raw := readEvidence(t, "sample-group.html")
	page, err := Parse(raw, "https://eg.timacad.ru/schedule/groups/?group=984")
	if err != nil {
		t.Fatal(err)
	}
	if page.Code != "ДА 01-24" || page.Course != 3 || page.ExternalID != 984 {
		t.Fatalf("group %+v", page)
	}
	if len(page.Lessons) < 2 {
		t.Fatalf("lessons %d", len(page.Lessons))
	}
	first := page.Lessons[0]
	if first.OccursOn != "2026-09-11" || first.StartsAt != "09:00" || first.EndsAt != "10:35" || first.Kind != "lab" || first.WeekType != "all" {
		t.Fatalf("first lesson %+v", first)
	}
	if first.Subject != "Основы селекции и семеноводства" {
		t.Fatalf("subject %q", first.Subject)
	}
	if first.Room == "" || first.Teacher == "" {
		t.Fatalf("place or teacher missing: %+v", first)
	}
}

func TestScheduleIndexKeepsPDFLinksAndNoLessons(t *testing.T) {
	raw := readEvidence(t, "schedule-source.html")
	page, err := Parse(raw, "https://www.timacad.ru/about/sveden/document/rezhim-zaniatii-obuchaiushchikhsia")
	if err != nil {
		t.Fatal(err)
	}
	if len(page.Lessons) != 0 {
		t.Fatalf("index page produced %d lessons", len(page.Lessons))
	}
	found := false
	for _, link := range page.PDFLinks {
		if link == "/uploads/files/20260914/1789367835_ieiu-1.pdf" {
			found = true
		}
	}
	if !found {
		t.Fatalf("pdf links %d, example missing", len(page.PDFLinks))
	}
}

func TestPDFBytesAreNotLessons(t *testing.T) {
	if _, err := Parse([]byte("%PDF-1.7 fake"), "https://www.timacad.ru/uploads/files/grid.pdf"); err == nil {
		t.Fatal("pdf bytes were parsed as a lesson page")
	}
}

func readEvidence(t *testing.T, name string) []byte {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for range 8 {
		path := filepath.Join(dir, "docs", "evidence", name)
		raw, err := os.ReadFile(path)
		if err == nil {
			return raw
		}
		dir = filepath.Dir(dir)
	}
	t.Fatalf("docs/evidence/%s not found", name)
	return nil
}
