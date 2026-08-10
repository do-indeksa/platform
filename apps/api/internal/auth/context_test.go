package auth

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRequestUserMiddleware(t *testing.T) {
	service := NewService(testPool, Config{})
	var got User
	var gotErr error
	handler := RequestUserMiddleware(service)(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		got, gotErr = RequestContextUser(r.Context())
	}))

	req := httptest.NewRequest(http.MethodPost, "/graphql", nil)
	handler.ServeHTTP(httptest.NewRecorder(), req)
	if !errors.Is(gotErr, ErrNoSession) {
		t.Fatalf("anonymous request: got %v", gotErr)
	}

	session := seedSession(t, time.Now().Add(time.Hour))
	req = httptest.NewRequest(http.MethodPost, "/graphql", nil)
	req.AddCookie(session)
	handler.ServeHTTP(httptest.NewRecorder(), req)
	if gotErr != nil || got.ID == [16]byte{} {
		t.Fatalf("authenticated request: user=%+v err=%v", got, gotErr)
	}
}

func TestRequestContextUserWithoutMiddleware(t *testing.T) {
	if _, err := RequestContextUser(t.Context()); !errors.Is(err, ErrNoSession) {
		t.Fatalf("got %v", err)
	}
}
