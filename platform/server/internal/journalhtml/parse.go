package journalhtml

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"golang.org/x/net/html"

	"raspos/platform/server/internal/canonical"
)

var (
	datePattern   = regexp.MustCompile(`^(\d{2})\.(\d{2})\.(\d{4})$`)
	timePattern   = regexp.MustCompile(`^(\d{2}:\d{2})-(\d{2}:\d{2})$`)
	coursePattern = regexp.MustCompile(`\((\d+) курс\)`)
)

// Page is one saved electronic-journal page.
// PDFLinks are addresses found on an index page. They are not fetched here.
type Page struct {
	Code       string
	Course     int
	ExternalID int
	Lessons    []canonical.Lesson
	PDFLinks   []string
}

// Parse reads saved HTML. It does not touch the network.
// A page with no lesson rows returns an empty lesson list.
func Parse(raw []byte, sourceURL string) (Page, error) {
	if len(raw) >= 4 && string(raw[:4]) == "%PDF" {
		return Page{}, fmt.Errorf("pdf bytes are stored and are not a lesson page")
	}
	root, err := html.Parse(strings.NewReader(string(raw)))
	if err != nil {
		return Page{}, err
	}
	page := Page{}
	selected := inputValue(root, "groupInput")
	page.Code = groupCode(selected)
	if match := coursePattern.FindStringSubmatch(selected); len(match) == 2 {
		page.Course, _ = strconv.Atoi(match[1])
	}
	page.ExternalID = optionID(root, selected)
	if title := textOfClass(root, "group-selected-title"); strings.HasPrefix(title, "Группа ") {
		page.Code = strings.TrimPrefix(title, "Группа ")
	}
	var date string
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode {
			class := attr(node, "class")
			if node.Data == "a" {
				if href := attr(node, "href"); strings.HasSuffix(strings.ToLower(href), ".pdf") {
					page.PDFLinks = append(page.PDFLinks, href)
				}
			}
			if strings.Contains(class, "group-schedule-head-date") {
				if parsed, ok := isoDate(textOfClass(node, "fw-semibold")); ok {
					date = parsed
				}
			}
			if node.Data == "li" && strings.Contains(class, "group-schedule-lesson-item") {
				if lesson, ok := lessonFrom(node, date, sourceURL); ok {
					page.Lessons = append(page.Lessons, lesson)
				}
			}
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(root)
	return page, nil
}

func lessonFrom(node *html.Node, date, sourceURL string) (canonical.Lesson, bool) {
	if date == "" {
		return canonical.Lesson{}, false
	}
	clock := textOfClass(node, "group-schedule-time-range")
	match := timePattern.FindStringSubmatch(strings.ReplaceAll(clock, " ", ""))
	if match == nil || match[1] >= match[2] {
		return canonical.Lesson{}, false
	}
	subject := textOfClass(node, "group-schedule-subject")
	if subject == "" {
		return canonical.Lesson{}, false
	}
	teacher, place := peopleAndPlace(node)
	return canonical.Lesson{
		OccursOn: date, StartsAt: match[1], EndsAt: match[2],
		Subject: subject, Kind: kindOf(node), Teacher: teacher,
		Building: "", Room: place, WeekType: weekOf(node), SourceURL: sourceURL,
	}, true
}

func peopleAndPlace(node *html.Node) (string, string) {
	var teacher, place string
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && strings.Contains(attr(n, "class"), "group-schedule-meta-line") {
			line := textContent(n)
			switch {
			case strings.Contains(attr(n, "class"), "seen"):
			default:
				if teacher == "" && strings.Contains(htmlOf(n), "bi-person") {
					teacher = cleanList(line, "Преподаватель не назначен")
				}
				if place == "" && strings.Contains(htmlOf(n), "bi-geo-alt") {
					place = cleanList(line, "")
				}
			}
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(node)
	return teacher, place
}

func kindOf(node *html.Node) string {
	class := classTree(node)
	switch {
	case strings.Contains(class, "group-schedule-tag-type-lab"):
		return "lab"
	case strings.Contains(class, "group-schedule-tag-type-lecture"):
		return "lecture"
	case strings.Contains(class, "group-schedule-tag-type-practice"):
		return "practice"
	default:
		return "other"
	}
}

func weekOf(node *html.Node) string {
	text := textOfClass(node, "group-schedule-week-badge")
	text = strings.TrimPrefix(text, "Неделя:")
	text = strings.TrimSpace(text)
	switch text {
	case "Обе", "Все", "":
		if text == "" {
			return ""
		}
		return "all"
	default:
		return text
	}
}

func cleanList(value, skip string) string {
	parts := strings.Split(value, ";")
	kept := make([]string, 0, len(parts))
	for _, part := range parts {
		part = strings.Join(strings.Fields(part), " ")
		if part == "" || part == skip {
			continue
		}
		kept = append(kept, part)
	}
	return strings.Join(kept, "; ")
}

func groupCode(selected string) string {
	if cut := strings.Index(selected, " ("); cut > 0 {
		return strings.TrimSpace(selected[:cut])
	}
	return strings.TrimSpace(selected)
}

func isoDate(value string) (string, bool) {
	match := datePattern.FindStringSubmatch(strings.TrimSpace(value))
	if match == nil {
		return "", false
	}
	return match[3] + "-" + match[2] + "-" + match[1], true
}

func inputValue(root *html.Node, id string) string {
	var value string
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "input" && attr(n, "id") == id {
			value = attr(n, "value")
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(root)
	return value
}

func optionID(root *html.Node, value string) int {
	var id int
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode && n.Data == "option" && attr(n, "value") == value {
			id, _ = strconv.Atoi(attr(n, "data-id"))
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(root)
	return id
}

func textOfClass(root *html.Node, class string) string {
	var found string
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if found != "" {
			return
		}
		if n.Type == html.ElementNode && hasClass(n, class) {
			found = textContent(n)
			return
		}
		for child := n.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(root)
	return found
}

func textContent(n *html.Node) string {
	var builder strings.Builder
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.TextNode {
			builder.WriteString(node.Data)
			builder.WriteByte(' ')
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(n)
	return strings.Join(strings.Fields(builder.String()), " ")
}

func classTree(n *html.Node) string {
	var builder strings.Builder
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode {
			builder.WriteString(attr(node, "class"))
			builder.WriteByte(' ')
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(n)
	return builder.String()
}

func htmlOf(n *html.Node) string {
	var builder strings.Builder
	for _, item := range n.Attr {
		builder.WriteString(item.Val)
		builder.WriteByte(' ')
	}
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node.Type == html.ElementNode {
			builder.WriteString(attr(node, "class"))
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(n)
	return builder.String()
}

func hasClass(n *html.Node, class string) bool {
	for _, part := range strings.Fields(attr(n, "class")) {
		if part == class {
			return true
		}
	}
	return false
}

func attr(n *html.Node, key string) string {
	for _, item := range n.Attr {
		if item.Key == key {
			return item.Val
		}
	}
	return ""
}
