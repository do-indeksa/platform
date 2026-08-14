package graph

import (
	"net/http"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/extension"
	"github.com/99designs/gqlgen/graphql/handler/lru"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/vektah/gqlparser/v2/ast"
)

const (
	maxGraphQLBodyBytes       = 256 << 10
	maxGraphQLDocumentBytes   = 16 << 10
	maxGraphQLDocumentTokens  = 4096
	maxGraphQLCachedDocuments = 1000
)

func NewHandler(resolver *Resolver) http.Handler {
	config := Config{Resolvers: resolver}
	configureComplexity(&config)

	server := handler.New(NewExecutableSchema(config))
	server.AddTransport(transport.Options{AllowedMethods: []string{http.MethodOptions, http.MethodPost}})
	server.AddTransport(transport.POST{})
	server.SetQueryCache(lru.New[*ast.QueryDocument](maxGraphQLCachedDocuments))
	server.SetParserTokenLimit(maxGraphQLDocumentTokens)
	server.SetErrorPresenter(errorPresenter)
	server.SetRecoverFunc(recoverError)
	server.Use(singleCommandMutations{})
	server.Use(extension.FixedComplexityLimit(maxGraphQLComplexity))

	return strictGraphQLRequests(server)
}
