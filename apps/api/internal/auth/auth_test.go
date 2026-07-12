package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"
	"golang.org/x/oauth2"

	"github.com/do-indeksa/platform/apps/api/db"
	"github.com/do-indeksa/platform/apps/api/internal/api"
)

const (
	testCanonical     = "http://localhost:3000"
	testPreviewOrigin = "https://do-indeksa-abc123-scope.vercel.app"
)

var testPool *pgxpool.Pool

func TestMain(m *testing.M) {
	ctx := context.Background()
	container, err := postgres.Run(ctx, "postgres:17-alpine",
		postgres.WithDatabase("test"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(time.Minute)))
	if err != nil {
		log.Fatal(err)
	}
	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		log.Fatal(err)
	}
	testPool, err = pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatal(err)
	}
	if err := db.Migrate(testPool); err != nil {
		log.Fatal(err)
	}
	code := m.Run()
	testPool.Close()
	_ = testcontainers.TerminateContainer(container)
	os.Exit(code)
}

func newFakeGoogle(t *testing.T, info userinfo) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("POST /token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `{"access_token":"at","token_type":"Bearer","expires_in":3600}`)
	})
	mux.HandleFunc("GET /userinfo", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(info)
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	return server
}

func newTestApp(t *testing.T, google *httptest.Server) http.Handler {
	t.Helper()
	service := NewService(testPool, Config{
		ClientID:            "client-id",
		ClientSecret:        "client-secret",
		Secret:              testKey,
		CanonicalOrigin:     testCanonical,
		PreviewOriginSuffix: "-scope.vercel.app",
	})
	service.endpoint = oauth2.Endpoint{AuthURL: google.URL + "/auth", TokenURL: google.URL + "/token"}
	service.userinfoURL = google.URL + "/userinfo"
	return api.HandlerFromMux(NewHandler(service), chi.NewRouter())
}

func do(t *testing.T, app http.Handler, method, target, host string, cookies []*http.Cookie) *http.Response {
	t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(method, target, nil)
	req.Host = host
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}
	app.ServeHTTP(rec, req)
	return rec.Result()
}

func sessionFromResponse(t *testing.T, res *http.Response) *http.Cookie {
	t.Helper()
	for _, cookie := range res.Cookies() {
		if cookie.Name == sessionCookieName {
			return cookie
		}
	}
	t.Fatal("no session cookie in response")
	return nil
}

func startAndCallback(t *testing.T, app http.Handler, host string) *http.Response {
	t.Helper()
	res := do(t, app, "GET", "/v1/auth/google?redirect=/prep", host, nil)
	if res.StatusCode != http.StatusFound {
		t.Fatalf("start: got status %d", res.StatusCode)
	}
	authURL, err := url.Parse(res.Header.Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	sealed := authURL.Query().Get("state")
	if sealed == "" {
		t.Fatal("no state in google redirect")
	}
	callback := "/v1/auth/google/callback?code=granted&state=" + url.QueryEscape(sealed)
	res = do(t, app, "GET", callback, "localhost:8080", nil)
	if res.StatusCode != http.StatusFound {
		t.Fatalf("callback: got status %d", res.StatusCode)
	}
	return res
}

func TestCanonicalSignInFlow(t *testing.T) {
	google := newFakeGoogle(t, userinfo{Sub: "sub-1", Email: "mika@example.com", Name: "Mika", Picture: "https://p.example/1.png"})
	app := newTestApp(t, google)

	res := startAndCallback(t, app, "localhost:3000")
	if loc := res.Header.Get("Location"); loc != "/prep" {
		t.Fatalf("callback redirect: got %q", loc)
	}
	session := sessionFromResponse(t, res)

	res = do(t, app, "GET", "/v1/me", "localhost:3000", []*http.Cookie{session})
	if res.StatusCode != http.StatusOK {
		t.Fatalf("me: got status %d", res.StatusCode)
	}
	var user api.User
	if err := json.NewDecoder(res.Body).Decode(&user); err != nil {
		t.Fatal(err)
	}
	if string(user.Email) != "mika@example.com" || user.Name != "Mika" {
		t.Fatalf("unexpected user: %+v", user)
	}

	res = do(t, app, "POST", "/v1/auth/logout", "localhost:3000", []*http.Cookie{session})
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("logout: got status %d", res.StatusCode)
	}
	res = do(t, app, "GET", "/v1/me", "localhost:3000", []*http.Cookie{session})
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("me after logout: got status %d", res.StatusCode)
	}
}

func TestPreviewSignInFlow(t *testing.T) {
	google := newFakeGoogle(t, userinfo{Sub: "sub-2", Email: "ana@example.com", Name: "Ana"})
	app := newTestApp(t, google)

	res := startAndCallback(t, app, "do-indeksa-abc123-scope.vercel.app")
	loc := res.Header.Get("Location")
	if !strings.HasPrefix(loc, testPreviewOrigin+"/api/v1/auth/exchange?code=") {
		t.Fatalf("callback redirect: got %q", loc)
	}
	for _, cookie := range res.Cookies() {
		if cookie.Name == sessionCookieName {
			t.Fatal("callback must not set a session cookie for preview origins")
		}
	}
	handoff, err := url.Parse(loc)
	if err != nil {
		t.Fatal(err)
	}
	code := handoff.Query().Get("code")

	exchange := "/v1/auth/exchange?code=" + url.QueryEscape(code)
	res = do(t, app, "GET", exchange, "do-indeksa-abc123-scope.vercel.app", nil)
	if res.StatusCode != http.StatusFound {
		t.Fatalf("exchange: got status %d", res.StatusCode)
	}
	if loc := res.Header.Get("Location"); loc != "/prep" {
		t.Fatalf("exchange redirect: got %q", loc)
	}
	session := sessionFromResponse(t, res)

	res = do(t, app, "GET", "/v1/me", "do-indeksa-abc123-scope.vercel.app", []*http.Cookie{session})
	if res.StatusCode != http.StatusOK {
		t.Fatalf("me: got status %d", res.StatusCode)
	}

	res = do(t, app, "GET", exchange, "do-indeksa-abc123-scope.vercel.app", nil)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("code reuse: got status %d", res.StatusCode)
	}
}

func TestStartRejectsUnknownOrigin(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)

	res := do(t, app, "GET", "/v1/auth/google", "evil.example", nil)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("got status %d", res.StatusCode)
	}
}

func TestCallbackRejectsTamperedState(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)

	res := do(t, app, "GET", "/v1/auth/google/callback?code=x&state=forged", "localhost:8080", nil)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("got status %d", res.StatusCode)
	}
}
