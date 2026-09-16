package diff

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"time"

	"timacad-backend/internal/domain"
)

// GroupFingerprint computes a deterministic hash of a group's entire schedule
type GroupFingerprint struct {
	GroupName    string `json:"group_name"`
	ScheduleHash string `json:"schedule_hash"`
	ClassCount   int    `json:"class_count"`
}

type DiffResult struct {
	PreviousGlobalHash string                 `json:"previous_global_hash"`
	CurrentGlobalHash  string                 `json:"current_global_hash"`
	HasChanges         bool                   `json:"has_changes"`
	ChangedGroupNames  []string               `json:"changed_group_names"`
	Deltas             []domain.ScheduleDelta `json:"deltas"`
}

// ComputeGlobalHash calculates a deterministic SHA-256 of all groups
func ComputeGlobalHash(groups map[string]domain.ScheduleResponse) string {
	h := sha256.New()
	for name, resp := range groups {
		groupBytes, _ := json.Marshal(resp.Schedule)
		fmt.Fprintf(h, "%s:%s\n", name, groupBytes)
	}
	return hex.EncodeToString(h.Sum(nil))
}

// ComputeGroupHash calculates SHA-256 for a single group's schedule
func ComputeGroupHash(schedule []domain.DaySchedule) string {
	b, _ := json.Marshal(schedule)
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// CompareSnapshots evaluates previous schedule data against fresh parsed data
func CompareSnapshots(
	oldGroups map[string]domain.ScheduleResponse,
	newGroups map[string]domain.ScheduleResponse,
	groupNameToID map[string]int,
) DiffResult {
	oldGlobal := ComputeGlobalHash(oldGroups)
	newGlobal := ComputeGlobalHash(newGroups)

	if oldGlobal == newGlobal && len(oldGroups) > 0 {
		return DiffResult{
			PreviousGlobalHash: oldGlobal,
			CurrentGlobalHash:  newGlobal,
			HasChanges:         false,
			ChangedGroupNames:  nil,
			Deltas:             nil,
		}
	}

	var changedGroups []string
	var deltas []domain.ScheduleDelta
	now := time.Now().UTC()

	for groupName, newResp := range newGroups {
		oldResp, exists := oldGroups[groupName]
		oldHash := ""
		if exists {
			oldHash = ComputeGroupHash(oldResp.Schedule)
		}
		newHash := ComputeGroupHash(newResp.Schedule)

		if !exists || oldHash != newHash {
			changedGroups = append(changedGroups, groupName)
			gID := groupNameToID[groupName]
			if gID == 0 {
				gID = newResp.GroupID
			}

			changeType := "schedule_modified"
			if !exists {
				changeType = "group_added"
			}

			deltaDetail, _ := json.Marshal(map[string]any{
				"group_name":    groupName,
				"prev_classes":  countClasses(oldResp.Schedule),
				"curr_classes":  countClasses(newResp.Schedule),
				"change_nature": changeType,
			})

			deltas = append(deltas, domain.ScheduleDelta{
				DetectedAt:   now,
				GroupID:      gID,
				ChangeType:   changeType,
				PreviousHash: oldHash,
				CurrentHash:  newHash,
				DetailsJSON:  string(deltaDetail),
			})
		}
	}

	return DiffResult{
		PreviousGlobalHash: oldGlobal,
		CurrentGlobalHash:  newGlobal,
		HasChanges:         len(changedGroups) > 0,
		ChangedGroupNames:  changedGroups,
		Deltas:             deltas,
	}
}

func countClasses(schedule []domain.DaySchedule) int {
	total := 0
	for _, d := range schedule {
		total += len(d.Classes)
	}
	return total
}
