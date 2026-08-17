package auth

import "context"

const expiredCleanupBatchSize = int32(1_000)

type expiredCleanupBatch func(context.Context, int32) (int64, error)

func (s *Service) CleanupExpired(ctx context.Context) error {
	return drainExpiredRows(
		ctx,
		expiredCleanupBatchSize,
		s.queries.DeleteExpiredSessionsBatch,
		s.queries.DeleteExpiredAuthCodesBatch,
	)
}

func drainExpiredRows(
	ctx context.Context,
	batchSize int32,
	deleteSessions expiredCleanupBatch,
	deleteAuthCodes expiredCleanupBatch,
) error {
	if batchSize <= 0 {
		panic("auth: expired cleanup batch size must be positive")
	}

	sessionsDrained := false
	authCodesDrained := false
	for !sessionsDrained || !authCodesDrained {
		if err := ctx.Err(); err != nil {
			return err
		}
		if !sessionsDrained {
			deleted, err := deleteSessions(ctx, batchSize)
			if err != nil {
				return err
			}
			sessionsDrained = deleted < int64(batchSize)
			if err := ctx.Err(); err != nil {
				return err
			}
		}
		if !authCodesDrained {
			deleted, err := deleteAuthCodes(ctx, batchSize)
			if err != nil {
				return err
			}
			authCodesDrained = deleted < int64(batchSize)
			if err := ctx.Err(); err != nil {
				return err
			}
		}
	}
	return nil
}
