package usecase

import (
	"context"
	"timacad-backend/internal/domain"
	"timacad-backend/internal/repository/postgres"
)

type GroupUseCase struct {
	pgRepo *postgres.Repository
}

func NewGroupUseCase(pgRepo *postgres.Repository) *GroupUseCase {
	return &GroupUseCase{pgRepo: pgRepo}
}

func (uc *GroupUseCase) ListGroups(ctx context.Context, instituteID *int, course *int) ([]domain.Group, error) {
	return uc.pgRepo.GetGroups(ctx, instituteID, course)
}

func (uc *GroupUseCase) GetGroup(ctx context.Context, id int) (*domain.Group, string, error) {
	return uc.pgRepo.GetGroupByID(ctx, id)
}
