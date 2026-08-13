package graph

import (
	"net/http"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/lru"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/vektah/gqlparser/v2/ast"

	"github.com/do-indeksa/platform/apps/api/internal/progress"
)

const (
	maxGraphQLBodyBytes       = 256 << 10
	maxGraphQLDocumentBytes   = 16 << 10
	maxGraphQLDocumentTokens  = 4096
	maxGraphQLCachedDocuments = 1000
	maxGraphQLComplexity      = 2000
)

func NewHandler(resolver *Resolver) http.Handler {
	config := Config{Resolvers: resolver}
	config.Complexity.Query.Runs = func(childComplexity int, limit int32) int {
		if limit < 1 {
			return childComplexity
		}
		if limit > 100 {
			limit = 100
		}
		return int(limit) * childComplexity
	}
	config.Complexity.Query.Attempts = func(childComplexity int, limit int32) int {
		if limit < 1 {
			return childComplexity
		}
		if limit > progress.MaxAttemptJournalEntries {
			limit = progress.MaxAttemptJournalEntries
		}
		return int(limit) * childComplexity
	}
	config.Complexity.Query.CompletedSimulationRuns = func(childComplexity int, limit int32) int {
		if limit < 1 {
			return childComplexity
		}
		if limit > progress.MaxCompletedSimulationRuns {
			limit = progress.MaxCompletedSimulationRuns
		}
		return int(limit) * childComplexity
	}
	config.Complexity.Run.Items = func(childComplexity int) int {
		return 10 * childComplexity
	}
	config.Complexity.CompletedSimulationRun.Items = func(childComplexity int) int {
		return 10 * childComplexity
	}
	config.Complexity.RunItem.RecentAttempts = func(childComplexity int, limit int32) int {
		if limit < 1 {
			return childComplexity
		}
		if limit > progress.MaxRecentRunItemAttempts {
			limit = progress.MaxRecentRunItemAttempts
		}
		return int(limit) * childComplexity
	}

	server := handler.New(NewExecutableSchema(config))
	server.AddTransport(transport.Options{AllowedMethods: []string{http.MethodOptions, http.MethodPost}})
	server.AddTransport(transport.POST{})
	server.SetQueryCache(lru.New[*ast.QueryDocument](maxGraphQLCachedDocuments))
	server.SetParserTokenLimit(maxGraphQLDocumentTokens)
	server.SetErrorPresenter(errorPresenter)
	server.SetRecoverFunc(recoverError)
	server.Use(extension.FixedComplexityLimit(maxGraphQLComplexity))

	return strictGraphQLRequests(server)
}
