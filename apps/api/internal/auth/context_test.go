package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
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

func TestRequestUserMiddlewareResolvesSessionOncePerRequest(t *testing.T) {
	service := NewService(testPool, Config{})
	unknownToken, _, err := newSecret()
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name         string
		cookie       *http.Cookie
		wantErr      error
		wantAcquires int64
	}{
		{
			name:         "authenticated",
			cookie:       seedSession(t, time.Now().Add(sessionTTL)),
			wantAcquires: 1,
		},
		{
			name: "malformed session",
			cookie: &http.Cookie{
				Name: localSessionCookieName, Value: "invalid-session-token",
			},
			wantErr:      ErrNoSession,
			wantAcquires: 0,
		},
		{
			name: "well-formed unknown session",
			cookie: &http.Cookie{
				Name: localSessionCookieName, Value: unknownToken,
			},
			wantErr:      ErrNoSession,
			wantAcquires: 1,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assertRequestIdentityResolvesOnce(
				t,
				service,
				tt.cookie,
				tt.wantErr,
				tt.wantAcquires,
			)
		})
	}
}

func assertRequestIdentityResolvesOnce(
	t *testing.T,
	service *Service,
	cookie *http.Cookie,
	wantErr error,
	wantAcquires int64,
) {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/graphql", nil)
	request.AddCookie(cookie)

	before := testPool.Stat().AcquireCount()
	var requestContext *http.Request
	RequestUserMiddleware(service)(http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
		requestContext = r
	})).ServeHTTP(httptest.NewRecorder(), request)
	if after := testPool.Stat().AcquireCount(); after != before {
		t.Fatalf("middleware acquired a connection: before=%d after=%d", before, after)
	}

	const callers = 16
	results := make(chan User, callers)
	errResults := make(chan error, callers)
	var group sync.WaitGroup
	for range callers {
		group.Add(1)
		go func() {
			defer group.Done()
			user, err := RequestContextUser(requestContext.Context())
			results <- user
			errResults <- err
		}()
	}
	group.Wait()
	close(results)
	close(errResults)

	for err := range errResults {
		if !errors.Is(err, wantErr) {
			t.Fatalf("resolve session = %v, want %v", err, wantErr)
		}
	}
	for user := range results {
		if wantErr == nil && user.ID == [16]byte{} {
			t.Fatal("resolved empty user")
		}
		if wantErr != nil && user.ID != [16]byte{} {
			t.Fatalf("failed identity returned user %+v", user)
		}
	}
	if after := testPool.Stat().AcquireCount(); after != before+wantAcquires {
		t.Fatalf("pool acquire count = %d, want %d", after, before+wantAcquires)
	}
}

func TestRequestUserUsesConfiguredSessionCookieName(t *testing.T) {
	service := NewService(testPool, Config{CanonicalOrigin: "https://doindeksa.rs"})
	localCookie := seedSession(t, time.Now().Add(time.Hour))

	request := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	request.AddCookie(localCookie)
	if _, _, err := service.RequestUser(request); !errors.Is(err, ErrNoSession) {
		t.Fatalf("legacy cookie authenticated HTTPS request: %v", err)
	}

	secureCookie := *localCookie
	secureCookie.Name = SessionCookieName
	request = httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	request.AddCookie(&secureCookie)
	user, _, err := service.RequestUser(request)
	if err != nil || user.ID == [16]byte{} {
		t.Fatalf("host-prefixed cookie failed authentication: user=%+v err=%v", user, err)
	}
}

func TestRequestUserDoesNotRefreshCookieWhenSessionExtensionFails(t *testing.T) {
	service := NewService(testPool, Config{})
	session := seedSession(t, time.Now().Add(time.Hour))
	ctx := t.Context()

	if _, err := testPool.Exec(ctx, `
		create function fail_test_session_extension() returns trigger
		language plpgsql as $$
		begin
			raise exception 'test session extension failure';
		end
		$$
	`); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(
			context.Background(),
			"drop trigger if exists fail_test_session_extension on sessions",
		)
		_, _ = testPool.Exec(
			context.Background(),
			"drop function if exists fail_test_session_extension()",
		)
	})
	if _, err := testPool.Exec(ctx, `
		create trigger fail_test_session_extension
		before update on sessions
		for each row execute function fail_test_session_extension()
	`); err != nil {
		t.Fatal(err)
	}

	request := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	request.AddCookie(session)
	user, refreshedCookie, err := service.RequestUser(request)

	if err != nil || user.ID == [16]byte{} {
		t.Fatalf("request user: user=%+v err=%v", user, err)
	}
	if refreshedCookie != nil {
		t.Fatalf("failed database extension produced cookie: %+v", refreshedCookie)
	}
}
