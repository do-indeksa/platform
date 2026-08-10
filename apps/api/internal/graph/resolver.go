package graph

import "github.com/do-indeksa/platform/apps/api/internal/progress"

type Resolver struct {
	progress *progress.Service
}

func NewResolver(progressService *progress.Service) *Resolver {
	return &Resolver{progress: progressService}
}
