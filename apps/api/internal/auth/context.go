package auth

import (
	"context"
	"net/http"
)

type requestIdentity struct {
	user User
	err  error
}

type requestIdentityKey struct{}

func RequestUserMiddleware(service *Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user, err := service.RequestUser(r)
			identity := requestIdentity{user: user, err: err}
			ctx := context.WithValue(r.Context(), requestIdentityKey{}, identity)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequestContextUser(ctx context.Context) (User, error) {
	identity, ok := ctx.Value(requestIdentityKey{}).(requestIdentity)
	if !ok {
		return User{}, ErrNoSession
	}
	return identity.user, identity.err
}
