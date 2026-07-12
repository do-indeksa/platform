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
	testPreviewHost   = "do-indeksa-abc123-scope.vercel.app"
	testPreviewOrigin = "https://" + testPreviewHost
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

type fakeGoogle struct {
	server   *httptest.Server
	verifier string
}

func newFakeGoogle(t *testing.T, info userinfo) *fakeGoogle {
	t.Helper()
	fake := &fakeGoogle{}
	mux := http.NewServeMux()
	mux.HandleFunc("POST /token", func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		fake.verifier = r.PostFormValue("code_verifier")
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprint(w, `{"access_token":"at","token_type":"Bearer","expires_in":3600}`)
	})
	mux.HandleFunc("GET /userinfo", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(info)
	})
	fake.server = httptest.NewServer(mux)
	t.Cleanup(fake.server.Close)
	return fake
}

func newTestApp(t *testing.T, google *fakeGoogle) http.Handler {
	t.Helper()
	service := NewService(testPool, Config{
		ClientID:            "client-id",
		ClientSecret:        "client-secret",
		Secret:              testKey,
		CanonicalOrigin:     testCanonical,
		PreviewOriginSuffix: "-scope.vercel.app",
	})
	service.endpoint = oauth2.Endpoint{AuthURL: google.server.URL + "/auth", TokenURL: google.server.URL + "/token"}
	service.userinfoURL = google.server.URL + "/userinfo"
	return api.HandlerWithOptions(NewHandler(service), api.ChiServerOptions{
		BaseRouter:       chi.NewRouter(),
		ErrorHandlerFunc: ParamErrorHandler,
	})
}

func do(t *testing.T, app http.Handler, method, target, host string, cookies ...*http.Cookie) *http.Response {
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

func assertNoSessionCookie(t *testing.T, res *http.Response) {
	t.Helper()
	for _, cookie := range res.Cookies() {
		if cookie.Name == sessionCookieName && cookie.MaxAge >= 0 {
			t.Fatal("unexpected session cookie in response")
		}
	}
}

func startFlow(t *testing.T, app http.Handler, host string) (sealed, challenge string) {
	t.Helper()
	res := do(t, app, "GET", "/v1/auth/google?redirect=/prep", host)
	if res.StatusCode != http.StatusFound {
		t.Fatalf("start: got status %d", res.StatusCode)
	}
	authURL, err := url.Parse(res.Header.Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	query := authURL.Query()
	if query.Get("code_challenge_method") != "S256" || query.Get("code_challenge") == "" {
		t.Fatalf("missing pkce challenge in %q", authURL)
	}
	if query.Get("state") == "" {
		t.Fatal("no state in google redirect")
	}
	return query.Get("state"), query.Get("code_challenge")
}

func completeCallback(t *testing.T, app http.Handler, query string) *http.Response {
	t.Helper()
	return do(t, app, "GET", "/v1/auth/google/callback?"+query, "localhost:8080")
}

func seedUser(t *testing.T) User {
	t.Helper()
	user, err := New(testPool).UpsertUser(context.Background(), UpsertUserParams{
		GoogleSub: "seed-" + t.Name(),
		Email:     strings.ToLower(t.Name()) + "@example.com",
		Name:      "Seed",
	})
	if err != nil {
		t.Fatal(err)
	}
	return user
}

func seedSession(t *testing.T, expiresAt time.Time) *http.Cookie {
	t.Helper()
	user := seedUser(t)
	token, tokenHash, err := newSecret()
	if err != nil {
		t.Fatal(err)
	}
	err = New(testPool).CreateSession(context.Background(), CreateSessionParams{
		TokenHash: tokenHash,
		UserID:    user.ID,
		ExpiresAt: expiresAt,
	})
	if err != nil {
		t.Fatal(err)
	}
	return &http.Cookie{Name: sessionCookieName, Value: token}
}

func TestCanonicalSignInFlow(t *testing.T) {
	google := newFakeGoogle(t, userinfo{Sub: "sub-1", Email: "mika@example.com", Name: "Mika", Picture: "https://p.example/1.png"})
	app := newTestApp(t, google)

	sealed, challenge := startFlow(t, app, "localhost:3000")
	res := completeCallback(t, app, "code=granted&state="+url.QueryEscape(sealed))
	if res.StatusCode != http.StatusFound {
		t.Fatalf("callback: got status %d", res.StatusCode)
	}
	if loc := res.Header.Get("Location"); loc != "/prep" {
		t.Fatalf("callback redirect: got %q", loc)
	}
	if oauth2.S256ChallengeFromVerifier(google.verifier) != challenge {
		t.Fatalf("token endpoint got verifier %q not matching challenge", google.verifier)
	}
	session := sessionFromResponse(t, res)
	if !session.HttpOnly || session.SameSite != http.SameSiteLaxMode ||
		session.Path != "/" || session.MaxAge != int(sessionTTL.Seconds()) || session.Secure {
		t.Fatalf("cookie attributes: %+v", session)
	}

	res = do(t, app, "GET", "/v1/me", "localhost:3000", session)
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

	res = do(t, app, "POST", "/v1/auth/logout", "localhost:3000", session)
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("logout: got status %d", res.StatusCode)
	}
	res = do(t, app, "GET", "/v1/me", "localhost:3000", session)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("me after logout: got status %d", res.StatusCode)
	}
}

func TestPreviewSignInFlow(t *testing.T) {
	google := newFakeGoogle(t, userinfo{Sub: "sub-2", Email: "ana@example.com", Name: "Ana"})
	app := newTestApp(t, google)

	sealed, _ := startFlow(t, app, testPreviewHost)
	res := completeCallback(t, app, "code=granted&state="+url.QueryEscape(sealed))
	if res.StatusCode != http.StatusFound {
		t.Fatalf("callback: got status %d", res.StatusCode)
	}
	loc := res.Header.Get("Location")
	if !strings.HasPrefix(loc, testPreviewOrigin+"/api/v1/auth/exchange?code=") {
		t.Fatalf("callback redirect: got %q", loc)
	}
	assertNoSessionCookie(t, res)
	handoff, err := url.Parse(loc)
	if err != nil {
		t.Fatal(err)
	}
	code := handoff.Query().Get("code")

	exchange := "/v1/auth/exchange?code=" + url.QueryEscape(code)
	res = do(t, app, "GET", exchange, testPreviewHost)
	if res.StatusCode != http.StatusFound {
		t.Fatalf("exchange: got status %d", res.StatusCode)
	}
	if loc := res.Header.Get("Location"); loc != "/prep" {
		t.Fatalf("exchange redirect: got %q", loc)
	}
	session := sessionFromResponse(t, res)

	res = do(t, app, "GET", "/v1/me", testPreviewHost, session)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("me: got status %d", res.StatusCode)
	}

	res = do(t, app, "GET", exchange, testPreviewHost)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("code reuse: got status %d", res.StatusCode)
	}
}

func TestSessionSlides(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)
	session := seedSession(t, time.Now().Add(10*24*time.Hour))

	res := do(t, app, "GET", "/v1/me", "localhost:3000", session)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("me: got status %d", res.StatusCode)
	}
	refreshed := sessionFromResponse(t, res)
	if refreshed.Value != session.Value || refreshed.MaxAge != int(sessionTTL.Seconds()) {
		t.Fatalf("cookie not refreshed: %+v", refreshed)
	}
	row, err := New(testPool).GetSessionUser(context.Background(), hashSecret(session.Value))
	if err != nil {
		t.Fatal(err)
	}
	if time.Until(row.ExpiresAt) < sessionTTL-time.Minute {
		t.Fatalf("db expiry not extended: %v", row.ExpiresAt)
	}
}

func TestFreshSessionNotRefreshed(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)
	session := seedSession(t, time.Now().Add(sessionTTL))

	res := do(t, app, "GET", "/v1/me", "localhost:3000", session)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("me: got status %d", res.StatusCode)
	}
	if len(res.Cookies()) != 0 {
		t.Fatalf("unexpected set-cookie on fresh session: %+v", res.Cookies())
	}
}

func TestExpiredSessionRejected(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)
	session := seedSession(t, time.Now().Add(-time.Minute))

	res := do(t, app, "GET", "/v1/me", "localhost:3000", session)
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("got status %d", res.StatusCode)
	}
}

func TestExpiredHandoffCodeRejected(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)
	user := seedUser(t)
	code, codeHash, err := newSecret()
	if err != nil {
		t.Fatal(err)
	}
	err = New(testPool).CreateAuthCode(context.Background(), CreateAuthCodeParams{
		CodeHash:  codeHash,
		UserID:    user.ID,
		Redirect:  "/prep",
		ExpiresAt: time.Now().Add(-time.Second),
	})
	if err != nil {
		t.Fatal(err)
	}

	res := do(t, app, "GET", "/v1/auth/exchange?code="+url.QueryEscape(code), testPreviewHost)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("got status %d", res.StatusCode)
	}
}

func TestLogoutIdempotent(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)
	session := seedSession(t, time.Now().Add(sessionTTL))

	for _, cookies := range [][]*http.Cookie{nil, {session}, {session}} {
		res := do(t, app, "POST", "/v1/auth/logout", "localhost:3000", cookies...)
		if res.StatusCode != http.StatusNoContent {
			t.Fatalf("logout: got status %d", res.StatusCode)
		}
		cleared := sessionFromResponse(t, res)
		if cleared.Value != "" || cleared.MaxAge >= 0 {
			t.Fatalf("cookie not cleared: %+v", cleared)
		}
	}
}

func TestCallbackCancelReturnsToApp(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)

	sealed, _ := startFlow(t, app, "localhost:3000")
	res := completeCallback(t, app, "error=access_denied&state="+url.QueryEscape(sealed))
	if res.StatusCode != http.StatusFound {
		t.Fatalf("got status %d", res.StatusCode)
	}
	if loc := res.Header.Get("Location"); loc != testCanonical+"/prep" {
		t.Fatalf("cancel redirect: got %q", loc)
	}
	assertNoSessionCookie(t, res)
}

func TestCallbackRejectsEmptySub(t *testing.T) {
	google := newFakeGoogle(t, userinfo{Sub: "", Email: "x@example.com"})
	app := newTestApp(t, google)

	sealed, _ := startFlow(t, app, "localhost:3000")
	res := completeCallback(t, app, "code=granted&state="+url.QueryEscape(sealed))
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("got status %d", res.StatusCode)
	}
	assertNoSessionCookie(t, res)
}

func TestStartRejectsUnknownOrigin(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)

	res := do(t, app, "GET", "/v1/auth/google", "evil.example")
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("got status %d", res.StatusCode)
	}
}

func TestCallbackRejectsTamperedState(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)

	res := completeCallback(t, app, "code=x&state=forged")
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("got status %d", res.StatusCode)
	}
}

func TestParamValidationErrorsAreJSON(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)

	res := do(t, app, "GET", "/v1/auth/exchange", testPreviewHost)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("got status %d", res.StatusCode)
	}
	if ct := res.Header.Get("Content-Type"); !strings.HasPrefix(ct, "application/json") {
		t.Fatalf("got content-type %q", ct)
	}
	var apiErr api.Error
	if err := json.NewDecoder(res.Body).Decode(&apiErr); err != nil {
		t.Fatal(err)
	}
	if apiErr.Code != "invalid_request" {
		t.Fatalf("got error code %q", apiErr.Code)
	}
}
