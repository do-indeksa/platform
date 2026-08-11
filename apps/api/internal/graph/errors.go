package graph

import (
	"context"
	"errors"
	"log/slog"

	"github.com/99designs/gqlgen/graphql"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/vektah/gqlparser/v2/gqlerror"

	"github.com/do-indeksa/platform/apps/api/internal/auth"
	"github.com/do-indeksa/platform/apps/api/internal/progress"
)

func requestUser(ctx context.Context) (auth.User, error) {
	user, err := auth.RequestContextUser(ctx)
	if err != nil {
		return auth.User{}, presentError(ctx, err)
	}
	return user, nil
}

func presentError(ctx context.Context, err error) error {
	switch {
	case errors.Is(err, auth.ErrNoSession):
		return codedError("UNAUTHENTICATED", "authentication required")
	case errors.Is(err, progress.ErrInvalidInput):
		return codedError("BAD_USER_INPUT", "input is invalid")
	case errors.Is(err, progress.ErrConflict):
		return codedError("CONFLICT", "write conflicts with existing data")
	case errors.Is(err, progress.ErrInvalidTransition):
		return codedError("INVALID_STATE", "run state does not allow this operation")
	case errors.Is(err, progress.ErrNotFound):
		return codedError("NOT_FOUND", "record not found")
	default:
		slog.Error("graphql operation failed", "request_id", middleware.GetReqID(ctx), "error", err)
		return codedError("INTERNAL", "internal server error")
	}
}

func recoverError(ctx context.Context, recovered any) error {
	slog.Error("graphql panic recovered", "request_id", middleware.GetReqID(ctx), "error", recovered)
	return codedError("INTERNAL", "internal server error")
}

func errorPresenter(ctx context.Context, err error) *gqlerror.Error {
	presented := graphql.DefaultErrorPresenter(ctx, err)
	if presented.Extensions == nil {
		presented.Extensions = map[string]any{}
	}
	if _, exists := presented.Extensions["code"]; !exists {
		presented.Extensions["code"] = "GRAPHQL_ERROR"
	}
	return presented
}

func codedError(code, message string) *gqlerror.Error {
	return &gqlerror.Error{Message: message, Extensions: map[string]any{"code": code}}
}
