package canonical

import (
	"crypto/sha256"
	"encoding/hex"
	"sort"
)

// Lesson is one official class in the canonical snapshot order.
type Lesson struct {
	OccursOn  string
	StartsAt  string
	EndsAt    string
	Subject   string
	Kind      string
	Teacher   string
	Building  string
	Room      string
	WeekType  string
	SourceURL string
}

func fields(lesson Lesson) [10]string {
	return [10]string{
		lesson.OccursOn,
		lesson.StartsAt,
		lesson.EndsAt,
		lesson.Subject,
		lesson.Kind,
		lesson.Teacher,
		lesson.Building,
		lesson.Room,
		lesson.WeekType,
		lesson.SourceURL,
	}
}

// Hash is the SHA-256 of the sorted canonical preimage.
// The same bytes are produced by timacad-core.
func Hash(lessons []Lesson) string {
	ordered := append([]Lesson(nil), lessons...)
	sort.Slice(ordered, func(i, j int) bool {
		a, b := fields(ordered[i]), fields(ordered[j])
		for n := range a {
			if a[n] == b[n] {
				continue
			}
			return a[n] < b[n]
		}
		return false
	})
	var buf []byte
	for _, lesson := range ordered {
		row := fields(lesson)
		for i, field := range row {
			if i > 0 {
				buf = append(buf, 0x1f)
			}
			buf = append(buf, field...)
		}
		buf = append(buf, 0x1e)
	}
	sum := sha256.Sum256(buf)
	return hex.EncodeToString(sum[:])
}
