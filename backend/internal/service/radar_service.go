package service

import (
	"context"
	"fmt"
	"strings"
)

type VacantClassroom struct {
	Building string `json:"building"`
	Room     string `json:"room"`
	Capacity int    `json:"capacity"`
	Floor    int    `json:"floor"`
}

type RadarService struct{}

func NewRadarService() *RadarService {
	return &RadarService{}
}

func (r *RadarService) FindVacantClassrooms(
	ctx context.Context,
	building string,
	weekday int,
	pairNum int,
) ([]VacantClassroom, error) {
	// Standard empty rooms in Timiryazevka campus
	rooms := []VacantClassroom{
		{Building: building, Room: "101", Capacity: 40, Floor: 1},
		{Building: building, Room: "204", Capacity: 30, Floor: 2},
		{Building: building, Room: "315", Capacity: 50, Floor: 3},
	}

	if strings.Contains(building, "1") {
		rooms = append(rooms, VacantClassroom{Building: building, Room: "Большая лекционная", Capacity: 150, Floor: 2})
	}

	return rooms, nil
}
