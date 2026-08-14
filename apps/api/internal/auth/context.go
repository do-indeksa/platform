package auth

import (
	"context"
	"net/http"
	"sync"
)

type requestIdentity struct {
	resolve func() (User, error)
}

type requestIdentityKey struct{}

func RequestUserMiddleware(service *Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			identity := requestIdentity{resolve: sync.OnceValues(func() (User, error) {
				user, refreshedCookie, err := service.RequestUser(r)
				if refreshedCookie != nil {
					http.SetCookie(w, refreshedCookie)
				}
				return user, err
			})}
			ctx := context.WithValue(r.Context(), requestIdentityKey{}, identity)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func RequestContextUser(ctx context.Context) (User, error) {
	identity, ok := ctx.Value(requestIdentityKey{}).(requestIdentity)
	if !ok || identity.resolve == nil {
		return User{}, ErrNoSession
	}
	return identity.resolve()
}
