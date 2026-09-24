package authz

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestAuthorizationModelFilesAgree(t *testing.T) {
	directory := filepath.Join("..", "..", "authz")
	dsl, err := os.ReadFile(filepath.Join(directory, "model.fga"))
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join(directory, "model.json"))
	if err != nil {
		t.Fatal(err)
	}
	text := string(dsl)
	for _, line := range []string{
		"schema 1.1",
		"define editor: head or deputy",
		"define reader: member or editor",
		"define can_propose: reader from group",
		"define can_publish: editor from group",
		"define can_edit: owner or reader from group",
		"define can_post: reader from group",
		"define can_hide: editor from group or staff from institute",
	} {
		if !strings.Contains(text, line) {
			t.Fatalf("model.fga is missing %q", line)
		}
	}
	var model struct {
		SchemaVersion   string `json:"schema_version"`
		TypeDefinitions []struct {
			Type      string                     `json:"type"`
			Relations map[string]json.RawMessage `json:"relations"`
		} `json:"type_definitions"`
	}
	if err := json.Unmarshal(raw, &model); err != nil {
		t.Fatal(err)
	}
	if model.SchemaVersion != "1.1" {
		t.Fatalf("schema %s", model.SchemaVersion)
	}
	relations := map[string]map[string]json.RawMessage{}
	for _, item := range model.TypeDefinitions {
		relations[item.Type] = item.Relations
	}
	if !unionOf(relations["group"]["editor"], "head", "deputy") {
		t.Fatal("JSON editor is not head or deputy")
	}
	if !unionOf(relations["group"]["reader"], "member", "editor") {
		t.Fatal("JSON reader is not member or editor")
	}
	if !fromGroup(relations["lesson_change"]["can_publish"], "editor") {
		t.Fatal("JSON can_publish is not editor from group")
	}
	if !fromGroup(relations["lesson_change"]["can_propose"], "reader") {
		t.Fatal("JSON can_propose is not reader from group")
	}
	if !fromGroup(relations["thread"]["can_post"], "reader") {
		t.Fatal("JSON can_post is not reader from group")
	}
	if !strings.Contains(string(relations["document"]["can_edit"]), `"relation": "reader"`) {
		t.Fatal("JSON can_edit does not include readers of the group")
	}
	if !strings.Contains(string(relations["thread"]["can_hide"]), `"relation": "editor"`) || !strings.Contains(string(relations["thread"]["can_hide"]), `"relation": "staff"`) {
		t.Fatal("JSON can_hide does not include the editor and institute staff")
	}
}

func unionOf(raw json.RawMessage, left, right string) bool {
	var body struct {
		Union struct {
			Child []struct {
				ComputedUserset struct {
					Relation string `json:"relation"`
				} `json:"computedUserset"`
			} `json:"child"`
		} `json:"union"`
	}
	if json.Unmarshal(raw, &body) != nil || len(body.Union.Child) != 2 {
		return false
	}
	return body.Union.Child[0].ComputedUserset.Relation == left && body.Union.Child[1].ComputedUserset.Relation == right
}

func fromGroup(raw json.RawMessage, relation string) bool {
	var body struct {
		TupleToUserset struct {
			Tupleset struct {
				Relation string `json:"relation"`
			} `json:"tupleset"`
			ComputedUserset struct {
				Relation string `json:"relation"`
			} `json:"computedUserset"`
		} `json:"tupleToUserset"`
	}
	if json.Unmarshal(raw, &body) != nil {
		return false
	}
	return body.TupleToUserset.Tupleset.Relation == "group" && body.TupleToUserset.ComputedUserset.Relation == relation
}
