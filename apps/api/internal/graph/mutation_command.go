package graph

import (
	"context"

	"github.com/99designs/gqlgen/graphql"
	"github.com/99designs/gqlgen/graphql/errcode"
	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/gqlerror"
)

type singleCommandMutations struct{}

var _ interface {
	graphql.HandlerExtension
	graphql.OperationContextMutator
} = singleCommandMutations{}

func (singleCommandMutations) ExtensionName() string {
	return "SingleCommandMutations"
}

func (singleCommandMutations) Validate(graphql.ExecutableSchema) error {
	return nil
}

func (singleCommandMutations) MutateOperationContext(
	_ context.Context,
	operation *graphql.OperationContext,
) *gqlerror.Error {
	if operation.Operation.Operation != ast.Mutation {
		return nil
	}
	fields := graphql.CollectFields(operation, operation.Operation.SelectionSet, nil)
	if len(fields) <= 1 {
		return nil
	}
	err := gqlerror.Errorf("mutation must contain at most one top-level command")
	errcode.Set(err, errcode.ValidationFailed)
	return err
}
