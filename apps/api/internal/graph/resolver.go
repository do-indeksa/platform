package graph

import (
	"github.com/do-indeksa/platform/apps/api/internal/prep"
	"github.com/do-indeksa/platform/apps/api/internal/progress"
	"github.com/do-indeksa/platform/apps/api/internal/training"
)

type Resolver struct {
	progress *progress.Service
	prep     *prep.Service
	training *training.Service
}

func NewResolver(
	progressService *progress.Service,
	prepService *prep.Service,
	trainingService *training.Service,
) *Resolver {
	return &Resolver{
		progress: progressService,
		prep:     prepService,
		training: trainingService,
	}
}
