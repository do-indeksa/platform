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

type testServer struct{ *Handler }

func (testServer) ListAttempts(http.ResponseWriter, *http.Request)   {}
func (testServer) RecordAttempts(http.ResponseWriter, *http.Request) {}

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
	router := chi.NewRouter()
	router.Use(CookieMutationOriginMiddleware(service))
	server := testServer{NewHandler(service)}
	for _, baseURL := range []string{"", "/api"} {
		api.HandlerWithOptions(server, api.ChiServerOptions{
			BaseURL:          baseURL,
			BaseRouter:       router,
			ErrorHandlerFunc: ParamErrorHandler,
		})
	}
	return router
}

func do(t *testing.T, app http.Handler, method, target, host string, cookies ...*http.Cookie) *http.Response {
	t.Helper()
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(method, target, nil)
	req.Host = host
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}
	if len(cookies) > 0 && method != http.MethodGet && method != http.MethodHead && method != http.MethodOptions {
		req.Header.Set("Origin", "http://"+host)
	}
	app.ServeHTTP(rec, req)
	return rec.Result()
}

func sessionFromResponse(t *testing.T, res *http.Response) *http.Cookie {
	t.Helper()
	for _, cookie := range res.Cookies() {
		if cookie.Name == SessionCookieName || cookie.Name == localSessionCookieName {
			return cookie
		}
	}
	t.Fatal("no session cookie in response")
	return nil
}

func assertNoSessionCookie(t *testing.T, res *http.Response) {
	t.Helper()
	for _, cookie := range res.Cookies() {
		if (cookie.Name == SessionCookieName || cookie.Name == localSessionCookieName) &&
			cookie.MaxAge >= 0 {
			t.Fatal("unexpected session cookie in response")
		}
	}
}

type authFlow struct {
	state          string
	challenge      string
	callbackCookie *http.Cookie
	handoffCookie  *http.Cookie
}

func startFlow(t *testing.T, app http.Handler, host string) authFlow {
	t.Helper()
	return startFlowWithRedirect(t, app, host, "/prep")
}

func startFlowWithRedirect(t *testing.T, app http.Handler, host, redirect string) authFlow {
	t.Helper()
	res := do(
		t,
		app,
		http.MethodGet,
		"/v1/auth/google?redirect="+url.QueryEscape(redirect),
		host,
	)
	if res.StatusCode != http.StatusFound {
		t.Fatalf("start: got status %d", res.StatusCode)
	}
	flow := authFlow{}
	if host == "localhost:3000" {
		flow.callbackCookie = oauthCookieFromResponse(t, res)
	} else {
		flow.handoffCookie = oauthCookieFromResponse(t, res)
		res = followOAuthRedirect(t, app, res.Header.Get("Location"))
		flow.callbackCookie = oauthCookieFromResponse(t, res)
		res = followOAuthRedirect(t, app, res.Header.Get("Location"), flow.handoffCookie)
		res = followOAuthRedirect(t, app, res.Header.Get("Location"), flow.callbackCookie)
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
	flow.state = query.Get("state")
	flow.challenge = query.Get("code_challenge")
	return flow
}

func followOAuthRedirect(
	t *testing.T,
	app http.Handler,
	location string,
	cookies ...*http.Cookie,
) *http.Response {
	t.Helper()
	redirect, err := url.Parse(location)
	if err != nil || !redirect.IsAbs() || redirect.Host == "" {
		t.Fatalf("invalid OAuth redirect %q: %v", location, err)
	}
	res := do(t, app, http.MethodGet, redirect.RequestURI(), redirect.Host, cookies...)
	if res.StatusCode != http.StatusFound {
		t.Fatalf("OAuth redirect %q returned %d", location, res.StatusCode)
	}
	return res
}

func oauthCookieFromResponse(t *testing.T, res *http.Response) *http.Cookie {
	t.Helper()
	for _, cookie := range res.Cookies() {
		if (strings.HasPrefix(cookie.Name, oauthBindingCookiePrefix) ||
			strings.HasPrefix(cookie.Name, secureBindingCookiePrefix)) && cookie.MaxAge > 0 {
			return cookie
		}
	}
	t.Fatal("no OAuth binding cookie in response")
	return nil
}

func newTestOAuthBinding(t *testing.T, origin string) (oauthBinding, *http.Cookie) {
	t.Helper()
	response := httptest.NewRecorder()
	binding, err := (&Service{}).newOAuthBinding(response, origin)
	if err != nil {
		t.Fatal(err)
	}
	return binding, oauthCookieFromResponse(t, response.Result())
}

func completeCallback(
	t *testing.T,
	app http.Handler,
	query string,
	cookies ...*http.Cookie,
) *http.Response {
	t.Helper()
	return do(t, app, "GET", "/v1/auth/google/callback?"+query, "localhost:3000", cookies...)
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

func ptr[T any](value T) *T {
	return &value
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
	return &http.Cookie{Name: localSessionCookieName, Value: token}
}

func TestCanonicalSignInFlow(t *testing.T) {
	google := newFakeGoogle(t, userinfo{Sub: "sub-1", Email: "mika@example.com", Name: "Mika", Picture: "https://p.example/1.png"})
	app := newTestApp(t, google)

	flow := startFlow(t, app, "localhost:3000")
	res := completeCallback(
		t,
		app,
		"code=granted&state="+url.QueryEscape(flow.state),
		flow.callbackCookie,
	)
	if res.StatusCode != http.StatusFound {
		t.Fatalf("callback: got status %d", res.StatusCode)
	}
	if loc := res.Header.Get("Location"); loc != "/prep" {
		t.Fatalf("callback redirect: got %q", loc)
	}
	if oauth2.S256ChallengeFromVerifier(google.verifier) != flow.challenge {
		t.Fatalf("token endpoint got verifier %q not matching challenge", google.verifier)
	}
	session := sessionFromResponse(t, res)
	if !session.HttpOnly || session.SameSite != http.SameSiteLaxMode ||
		session.Name != localSessionCookieName || session.Path != "/" ||
		session.MaxAge != int(sessionTTL.Seconds()) || session.Secure {
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

	flow := startFlow(t, app, testPreviewHost)
	res := completeCallback(
		t,
		app,
		"code=granted&state="+url.QueryEscape(flow.state),
		flow.callbackCookie,
	)
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
	if handoff.Query().Get("code") == "" || handoff.Query().Get("binding") == "" {
		t.Fatal("callback did not issue a bound handoff")
	}
	exchange := "/v1/auth/exchange?" + handoff.RawQuery
	res = do(t, app, "GET", exchange, testPreviewHost, flow.handoffCookie)
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

	res = do(t, app, "GET", exchange, testPreviewHost, flow.handoffCookie)
	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("code reuse: got status %d", res.StatusCode)
	}
}

func TestPreviewSignInNormalizesOriginBeforeSealingState(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)
	request := httptest.NewRequest(http.MethodGet, "/v1/auth/google?redirect=/prep", nil)
	request.Host = "api.internal"
	request.Header.Set("X-Di-Forwarded-Origin", "HTTPS://DO-INDEKSA-ABC123-SCOPE.VERCEL.APP:443/")
	response := httptest.NewRecorder()

	app.ServeHTTP(response, request)

	if response.Code != http.StatusFound {
		t.Fatalf("normalized preview start returned %d", response.Code)
	}
	bootstrapURL, err := url.Parse(response.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	bootstrap, err := openOAuthBootstrap(
		testKey,
		bootstrapURL.Query().Get("request"),
		time.Now(),
	)
	if err != nil {
		t.Fatal(err)
	}
	if bootstrap.Origin != testPreviewOrigin {
		t.Fatalf("sealed origin = %q, want %q", bootstrap.Origin, testPreviewOrigin)
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
	code, _, err := newSecret()
	if err != nil {
		t.Fatal(err)
	}
	binding, bindingCookie := newTestOAuthBinding(t, testPreviewOrigin)
	bindingHash, _ := decodeBindingHash(binding)
	err = New(testPool).CreateAuthCode(context.Background(), CreateAuthCodeParams{
		CodeHash:           hashHandoffCode(code),
		UserID:             user.ID,
		Origin:             ptr(testPreviewOrigin),
		Redirect:           "/prep",
		BrowserBindingID:   ptr(binding.ID),
		BrowserBindingHash: bindingHash,
		ExpiresAt:          time.Now().Add(-time.Second),
	})
	if err != nil {
		t.Fatal(err)
	}

	res := do(
		t,
		app,
		"GET",
		"/v1/auth/exchange?code="+url.QueryEscape(code)+"&binding="+url.QueryEscape(binding.ID),
		testPreviewHost,
		bindingCookie,
	)
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

func TestLogoutRejectsCrossOriginSession(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)
	session := seedSession(t, time.Now().Add(sessionTTL))
	request := httptest.NewRequest(http.MethodPost, "/v1/auth/logout", nil)
	request.Host = "localhost:3000"
	request.Header.Set("Origin", "https://evil.example")
	request.AddCookie(session)
	response := httptest.NewRecorder()

	app.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden || !strings.Contains(response.Body.String(), `"code":"cross_site_request"`) {
		t.Fatalf("cross-origin logout returned %d: %s", response.Code, response.Body.String())
	}
	res := do(t, app, http.MethodGet, "/v1/me", "localhost:3000", session)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("session was revoked by rejected logout: %d", res.StatusCode)
	}
}

func TestCallbackCancelReturnsToApp(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)

	flow := startFlow(t, app, "localhost:3000")
	res := completeCallback(
		t,
		app,
		"error=access_denied&state="+url.QueryEscape(flow.state),
		flow.callbackCookie,
	)
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

	flow := startFlow(t, app, "localhost:3000")
	res := completeCallback(
		t,
		app,
		"code=granted&state="+url.QueryEscape(flow.state),
		flow.callbackCookie,
	)
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

func TestStartRejectsPreviewSuffixOutsideHostname(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)
	for _, origin := range []string{
		"https://evil.example/-scope.vercel.app",
		"https://evil.example?next=-scope.vercel.app",
		"https://evil.example#-scope.vercel.app",
		"https://user@do-indeksa-abc123-scope.vercel.app",
		"https://do-indeksa-abc123-scope.vercel.app:444/-scope.vercel.app",
	} {
		t.Run(origin, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodGet, "/v1/auth/google", nil)
			request.Host = "api.internal"
			request.Header.Set("X-Di-Forwarded-Origin", origin)
			response := httptest.NewRecorder()

			app.ServeHTTP(response, request)

			if response.Code != http.StatusBadRequest || response.Header().Get("Location") != "" {
				t.Fatalf("malformed preview origin returned %d with location %q", response.Code, response.Header().Get("Location"))
			}
		})
	}
}

func TestCallbackRevalidatesSealedOriginBeforeCodeExchange(t *testing.T) {
	google := newFakeGoogle(t, userinfo{Sub: "sub-stale", Email: "stale@example.com"})
	app := newTestApp(t, google)
	binding, cookie := newTestOAuthBinding(t, testCanonical)
	sealed, err := sealState(testKey, state{
		Origin:          "https://evil.example/-scope.vercel.app",
		Redirect:        "/prep",
		Verifier:        "verifier-secret",
		CallbackBinding: binding,
		ExpiresAt:       time.Now().Add(stateTTL).Unix(),
	})
	if err != nil {
		t.Fatal(err)
	}

	res := completeCallback(t, app, "code=granted&state="+url.QueryEscape(sealed), cookie)

	if res.StatusCode != http.StatusBadRequest || res.Header.Get("Location") != "" {
		t.Fatalf("stale state returned %d with location %q", res.StatusCode, res.Header.Get("Location"))
	}
	if google.verifier != "" {
		t.Fatalf("callback exchanged code using verifier %q before revalidating origin", google.verifier)
	}
}

func TestCancelledCallbackRevalidatesSealedOrigin(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)
	binding, cookie := newTestOAuthBinding(t, testCanonical)
	sealed, err := sealState(testKey, state{
		Origin:          "https://evil.example/-scope.vercel.app",
		Redirect:        "/prep",
		Verifier:        "verifier-secret",
		CallbackBinding: binding,
		ExpiresAt:       time.Now().Add(stateTTL).Unix(),
	})
	if err != nil {
		t.Fatal(err)
	}

	res := completeCallback(t, app, "error=access_denied&state="+url.QueryEscape(sealed), cookie)

	if res.StatusCode != http.StatusBadRequest || res.Header.Get("Location") != "" {
		t.Fatalf("cancelled stale state returned %d with location %q", res.StatusCode, res.Header.Get("Location"))
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
