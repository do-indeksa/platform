package graph

import (
	"github.com/do-indeksa/platform/apps/api/internal/progress"
	"github.com/do-indeksa/platform/apps/api/internal/training"
)

type Resolver struct {
	progress *progress.Service
	training *training.Service
}

func NewResolver(
	progressService *progress.Service,
	trainingService *training.Service,
) *Resolver {
	return &Resolver{
		progress: progressService,
		training: trainingService,
	}
}
