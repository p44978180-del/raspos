package v4

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"

	"raspos/platform/server/internal/canonical"
)

var (
	datePattern = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}$`)
	timePattern = regexp.MustCompile(`^(?:[01]\d|2[0-3]):[0-5]\d$`)
	kinds       = map[string]struct{}{"lecture": {}, "practice": {}, "lab": {}, "other": {}}
)

type Catalog struct {
	Meta    Meta
	Groups  []Group
	RawHash string
}

type Meta struct {
	DataVersion  string `json:"dataVersion"`
	CheckedAt    string `json:"checkedAt"`
	TotalGroups  int    `json:"totalGroups"`
	TotalClasses int    `json:"totalClasses"`
}

type Group struct {
	Code         string
	ExternalID   int
	InstituteID  string
	Institute    string
	Course       int
	Degree       string
	StudyForm    string
	Status       string
	SourceURL    string
	SchedulePath string
}

type groupJSON struct {
	ID           int    `json:"id"`
	Name         string `json:"name"`
	Institute    string `json:"institute"`
	InstituteID  string `json:"instituteId"`
	Course       int    `json:"course"`
	StudyForm    string `json:"studyForm"`
	Education    string `json:"educationLevel"`
	SourceURL    string `json:"sourceUrl"`
	Status       string `json:"status"`
	SchedulePath string `json:"schedulePath"`
}

type catalogFile struct {
	Meta struct {
		DataVersion  string `json:"dataVersion"`
		CheckedAt    string `json:"checkedAt"`
		TotalGroups  int    `json:"totalGroups"`
		TotalClasses int    `json:"totalClasses"`
	} `json:"meta"`
	Institutes []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"institutes"`
	Groups map[string]groupJSON `json:"groups"`
}

// LoadCatalog reads the v4 catalog. Root is the public directory that contains data/.
func LoadCatalog(publicRoot string) (Catalog, error) {
	path := filepath.Join(publicRoot, "data", "official-schedule.json")
	raw, err := os.ReadFile(path)
	if err != nil {
		return Catalog{}, err
	}
	var file catalogFile
	if err := json.Unmarshal(raw, &file); err != nil {
		return Catalog{}, fmt.Errorf("catalog json: %w", err)
	}
	if file.Meta.TotalGroups != len(file.Groups) {
		return Catalog{}, fmt.Errorf("catalog totalGroups %d, entries %d", file.Meta.TotalGroups, len(file.Groups))
	}
	sum := sha256.Sum256(raw)
	groups := make([]Group, 0, len(file.Groups))
	for code, item := range file.Groups {
		if item.Name != code || item.SchedulePath == "" || item.InstituteID == "" {
			return Catalog{}, fmt.Errorf("group %s has an incomplete catalog row", code)
		}
		groups = append(groups, Group{
			Code:         code,
			ExternalID:   item.ID,
			InstituteID:  item.InstituteID,
			Institute:    item.Institute,
			Course:       item.Course,
			Degree:       item.Education,
			StudyForm:    item.StudyForm,
			Status:       item.Status,
			SourceURL:    item.SourceURL,
			SchedulePath: item.SchedulePath,
		})
	}
	return Catalog{
		Meta: Meta{
			DataVersion:  file.Meta.DataVersion,
			CheckedAt:    file.Meta.CheckedAt,
			TotalGroups:  file.Meta.TotalGroups,
			TotalClasses: file.Meta.TotalClasses,
		},
		Groups:  groups,
		RawHash: hex.EncodeToString(sum[:]),
	}, nil
}

// LoadLessons reads one group file and returns canonical lessons.
func LoadLessons(publicRoot string, group Group) ([]canonical.Lesson, string, error) {
	path := filepath.Join(publicRoot, filepath.FromSlash(group.SchedulePath))
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, "", err
	}
	var file struct {
		SourceURL string `json:"sourceUrl"`
		Schedule  []struct {
			Date    string `json:"date"`
			Classes []struct {
				Start     string `json:"start"`
				End       string `json:"end"`
				Subject   string `json:"subject"`
				Type      string `json:"type"`
				Teacher   string `json:"teacher"`
				Building  string `json:"building"`
				Room      string `json:"room"`
				WeekType  string `json:"weekType"`
				SourceURL string `json:"sourceUrl"`
			} `json:"classes"`
		} `json:"schedule"`
	}
	if err := json.Unmarshal(raw, &file); err != nil {
		return nil, "", fmt.Errorf("%s: %w", group.Code, err)
	}
	lessons := make([]canonical.Lesson, 0)
	for _, day := range file.Schedule {
		if !datePattern.MatchString(day.Date) {
			return nil, "", fmt.Errorf("%s: bad date %q", group.Code, day.Date)
		}
		for _, class := range day.Classes {
			if !timePattern.MatchString(class.Start) || !timePattern.MatchString(class.End) || class.Start >= class.End {
				return nil, "", fmt.Errorf("%s: bad time %s-%s", group.Code, class.Start, class.End)
			}
			if class.Subject == "" {
				return nil, "", fmt.Errorf("%s: empty subject on %s", group.Code, day.Date)
			}
			if _, ok := kinds[class.Type]; !ok {
				return nil, "", fmt.Errorf("%s: unknown kind %q", group.Code, class.Type)
			}
			source := class.SourceURL
			if source == "" {
				source = file.SourceURL
			}
			if source == "" {
				source = group.SourceURL
			}
			lessons = append(lessons, canonical.Lesson{
				OccursOn:  day.Date,
				StartsAt:  class.Start,
				EndsAt:    class.End,
				Subject:   class.Subject,
				Kind:      class.Type,
				Teacher:   class.Teacher,
				Building:  class.Building,
				Room:      class.Room,
				WeekType:  class.WeekType,
				SourceURL: source,
			})
		}
	}
	sum := sha256.Sum256(raw)
	return lessons, hex.EncodeToString(sum[:]), nil
}
