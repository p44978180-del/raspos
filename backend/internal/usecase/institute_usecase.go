package usecase

import (
	"context"
	"timacad-backend/internal/domain"
	"timacad-backend/internal/repository/postgres"
)

type InstituteUseCase struct {
	pgRepo *postgres.Repository
}

func NewInstituteUseCase(pgRepo *postgres.Repository) *InstituteUseCase {
	return &InstituteUseCase{pgRepo: pgRepo}
}

func (uc *InstituteUseCase) ListInstitutes(ctx context.Context) ([]domain.Institute, error) {
	return uc.pgRepo.GetInstitutesWithCourses(ctx)
}
