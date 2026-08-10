package progress

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Service struct {
	pool    *pgxpool.Pool
	queries *Queries
}

func NewService(pool *pgxpool.Pool) *Service {
	return &Service{pool: pool, queries: New(pool)}
}

func (s *Service) Record(ctx context.Context, userID uuid.UUID, attempts []InsertAttemptsParams) error {
	now := time.Now().UTC()
	for i := range attempts {
		attempts[i].UserID = userID
		if attempts[i].CreatedAt.IsZero() || attempts[i].CreatedAt.After(now) {
			attempts[i].CreatedAt = now
		}
		at := pgtype.Timestamptz{Time: attempts[i].CreatedAt, Valid: true}
		outcome := string(AttemptOutcomeIncorrect)
		if attempts[i].Correct {
			outcome = string(AttemptOutcomeCorrect)
		}
		gradingKind := string(GradingKindAuto)
		attempts[i].StartedAt = at
		attempts[i].SubmittedAt = at
		attempts[i].Outcome = &outcome
		attempts[i].GradingKind = &gradingKind
	}
	_, err := s.queries.InsertAttempts(ctx, attempts)
	return err
}

func (s *Service) List(ctx context.Context, userID uuid.UUID) ([]ListAttemptsRow, error) {
	return s.queries.ListAttempts(ctx, userID)
}
