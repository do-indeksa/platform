package progress

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	queries *Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{queries: New(pool)}
}

func (s *Service) Record(ctx context.Context, userID uuid.UUID, attempts []InsertAttemptsParams) error {
	now := time.Now()
	for i := range attempts {
		attempts[i].UserID = userID
		if attempts[i].CreatedAt.IsZero() || attempts[i].CreatedAt.After(now) {
			attempts[i].CreatedAt = now
		}
	}
	_, err := s.queries.InsertAttempts(ctx, attempts)
	return err
}

func (s *Service) List(ctx context.Context, userID uuid.UUID) ([]ListAttemptsRow, error) {
	return s.queries.ListAttempts(ctx, userID)
}
