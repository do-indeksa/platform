package graph

import (
	"github.com/do-indeksa/platform/apps/api/internal/prep"
	"github.com/do-indeksa/platform/apps/api/internal/progress"
)

type Resolver struct {
	progress *progress.Service
	prep     *prep.Service
}

func NewResolver(progressService *progress.Service, prepService *prep.Service) *Resolver {
	return &Resolver{progress: progressService, prep: prepService}
}
