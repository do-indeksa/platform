package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
	"time"
)

func TestPreviewSignInPreservesNormalizedReturnPath(t *testing.T) {
	google := newFakeGoogle(t, userinfo{Sub: "sub-preview-path", Email: "preview-path@example.com"})
	app := newTestApp(t, google)
	requested := "/sr/tasks/../prep/?tab=week#today"
	res := do(
		t,
		app,
		http.MethodGet,
		"/v1/auth/google?redirect="+url.QueryEscape(requested),
		testPreviewHost,
	)
	if res.StatusCode != http.StatusFound {
		t.Fatalf("start returned %d", res.StatusCode)
	}
	authURL, err := url.Parse(res.Header.Get("Location"))
	if err != nil {
		t.Fatal(err)
	}

	res = completeCallback(t, app, "code=granted&state="+url.QueryEscape(authURL.Query().Get("state")))
	if res.StatusCode != http.StatusFound {
		t.Fatalf("callback returned %d", res.StatusCode)
	}
	handoff, err := url.Parse(res.Header.Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	code := handoff.Query().Get("code")
	if code == "" {
		t.Fatal("callback did not issue handoff code")
	}

	res = do(
		t,
		app,
		http.MethodGet,
		"/v1/auth/exchange?code="+url.QueryEscape(code),
		testPreviewHost,
	)
	if res.StatusCode != http.StatusFound {
		t.Fatalf("exchange returned %d", res.StatusCode)
	}
	if location := res.Header.Get("Location"); location != "/sr/prep/?tab=week#today" {
		t.Fatalf("exchange location = %q", location)
	}
}

func TestStartSanitizesAmbiguousReturnPathBeforeSealingState(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)
	request := httptest.NewRequest(
		http.MethodGet,
		"/v1/auth/google?redirect="+url.QueryEscape(`/\evil.example`),
		nil,
	)
	request.Host = "localhost:3000"
	response := httptest.NewRecorder()

	app.ServeHTTP(response, request)

	if response.Code != http.StatusFound {
		t.Fatalf("start returned %d: %s", response.Code, response.Body.String())
	}
	authURL, err := url.Parse(response.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	st, err := openState(testKey, authURL.Query().Get("state"), time.Now())
	if err != nil {
		t.Fatal(err)
	}
	if st.Redirect != "/" {
		t.Fatalf("sealed redirect = %q, want root", st.Redirect)
	}
}

func TestCallbackRejectsUnsafeReturnPathBeforeCodeExchange(t *testing.T) {
	google := newFakeGoogle(t, userinfo{Sub: "sub-return-path", Email: "return-path@example.com"})
	app := newTestApp(t, google)
	sealed := unsafeReturnPathState(t, testCanonical)

	res := completeCallback(t, app, "code=granted&state="+url.QueryEscape(sealed))

	assertUnsafeReturnPathRejected(t, res)
	if google.verifier != "" {
		t.Fatalf("callback exchanged code using verifier %q before validating redirect", google.verifier)
	}
}

func TestCancelledCallbackRejectsUnsafeReturnPath(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)
	sealed := unsafeReturnPathState(t, testCanonical)

	res := completeCallback(t, app, "error=access_denied&state="+url.QueryEscape(sealed))

	assertUnsafeReturnPathRejected(t, res)
}

func TestPreviewCallbackRejectsUnsafeReturnPathBeforeHandoffMint(t *testing.T) {
	google := newFakeGoogle(t, userinfo{Sub: "sub-preview-return", Email: "preview-return@example.com"})
	app := newTestApp(t, google)
	sealed := unsafeReturnPathState(t, testPreviewOrigin)

	res := completeCallback(t, app, "code=granted&state="+url.QueryEscape(sealed))

	assertUnsafeReturnPathRejected(t, res)
	if google.verifier != "" {
		t.Fatalf("preview callback exchanged code using verifier %q before validating redirect", google.verifier)
	}
}

func TestExchangeRejectsStoredUnsafeReturnPathBeforeSessionIssue(t *testing.T) {
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
		Redirect:  `/\evil.example`,
		ExpiresAt: time.Now().Add(codeTTL),
	})
	if err != nil {
		t.Fatal(err)
	}

	res := do(
		t,
		app,
		http.MethodGet,
		"/v1/auth/exchange?code="+url.QueryEscape(code),
		testPreviewHost,
	)

	assertUnsafeReturnPathRejected(t, res)

	var authCodeCount int
	if err := testPool.QueryRow(
		context.Background(),
		"select count(*) from auth_codes where user_id = $1",
		user.ID,
	).Scan(&authCodeCount); err != nil {
		t.Fatal(err)
	}
	if authCodeCount != 0 {
		t.Fatalf("unsafe handoff remained consumable: %d rows", authCodeCount)
	}
	var sessionCount int
	if err := testPool.QueryRow(
		context.Background(),
		"select count(*) from sessions where user_id = $1",
		user.ID,
	).Scan(&sessionCount); err != nil {
		t.Fatal(err)
	}
	if sessionCount != 0 {
		t.Fatalf("unsafe handoff issued %d sessions", sessionCount)
	}
}

func TestMintHandoffCodeRejectsUnsafeReturnPathBeforeInsert(t *testing.T) {
	user := seedUser(t)
	service := NewService(testPool, Config{})

	_, err := service.MintHandoffCode(context.Background(), user.ID, `/\evil.example`)
	if !errors.Is(err, errInvalidReturnPath) {
		t.Fatalf("MintHandoffCode() error = %v, want invalid return path", err)
	}

	var authCodeCount int
	if err := testPool.QueryRow(
		context.Background(),
		"select count(*) from auth_codes where user_id = $1",
		user.ID,
	).Scan(&authCodeCount); err != nil {
		t.Fatal(err)
	}
	if authCodeCount != 0 {
		t.Fatalf("unsafe handoff inserted %d rows", authCodeCount)
	}
}

func unsafeReturnPathState(t *testing.T, origin string) string {
	t.Helper()
	sealed, err := sealState(testKey, state{
		Origin:    origin,
		Redirect:  `/\evil.example`,
		Verifier:  "verifier-secret",
		ExpiresAt: time.Now().Add(stateTTL).Unix(),
	})
	if err != nil {
		t.Fatal(err)
	}
	return sealed
}

func assertUnsafeReturnPathRejected(t *testing.T, res *http.Response) {
	t.Helper()
	if res.StatusCode != http.StatusBadRequest || res.Header.Get("Location") != "" {
		t.Fatalf("unsafe return path returned %d with location %q", res.StatusCode, res.Header.Get("Location"))
	}
	assertNoSessionCookie(t, res)
}
