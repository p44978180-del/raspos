package service

import (
	"context"
	"sort"
	"time"
)

type FreeWindow struct {
	StartTime time.Time `json:"start_time"`
	EndTime   time.Time `json:"end_time"`
	Duration  time.Duration `json:"duration"`
	Groups    []string `json:"groups"`
	Type      string `json:"type"`
}

type MatchmakingService struct{}

func NewMatchmakingService() *MatchmakingService {
	return &MatchmakingService{}
}

func (s *MatchmakingService) IntersectGroupWindows(
	ctx context.Context,
	windowsA []FreeWindow,
	windowsB []FreeWindow,
) []FreeWindow {
	var results []FreeWindow

	for _, wa := range windowsA {
		for _, wb := range windowsB {
			start := wa.StartTime
			if wb.StartTime.After(start) {
				start = wb.StartTime
			}

			end := wa.EndTime
			if wb.EndTime.Before(end) {
				end = wb.EndTime
			}

			if end.After(start) {
				dur := end.Sub(start)
				if dur >= 30*time.Minute {
					recommendation := "Коворкинг"
					if start.Hour() >= 12 && start.Hour() <= 14 {
						recommendation = "Обед в Комбинате питания"
					}

					allGroups := append(append([]string{}, wa.Groups...), wb.Groups...)
					results = append(results, FreeWindow{
						StartTime: start,
						EndTime:   end,
						Duration:  dur,
						Groups:    allGroups,
						Type:      recommendation,
					})
				}
			}
		}
	}

	sort.Slice(results, func(i, j int) bool {
		return results[i].StartTime.Before(results[j].StartTime)
	})

	return results
}
