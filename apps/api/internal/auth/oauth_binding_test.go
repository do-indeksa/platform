package auth

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"
	"testing"

	"github.com/do-indeksa/platform/apps/api/internal/api"
)

func TestCallbackRejectsAuthorizationMovedToAnotherBrowser(t *testing.T) {
	google := newFakeGoogle(t, userinfo{
		Sub:   "sub-moved-callback",
		Email: "moved-callback@example.com",
	})
	app := newTestApp(t, google)
	flow := startFlow(t, app, "localhost:3000")

	res := completeCallback(t, app, "code=granted&state="+url.QueryEscape(flow.state))

	if res.StatusCode != http.StatusBadRequest || res.Header.Get("Location") != "" {
		t.Fatalf(
			"moved callback returned %d with location %q, want invalid state",
			res.StatusCode,
			res.Header.Get("Location"),
		)
	}
	assertNoSessionCookie(t, res)
	if google.verifier != "" {
		t.Fatalf("moved callback reached provider with verifier %q", google.verifier)
	}
}

func TestOAuthResponsesDisableCaching(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)
	res := do(t, app, http.MethodGet, "/v1/auth/google?redirect=/prep", "localhost:3000")
	if res.Header.Get("Cache-Control") != "no-store" || res.Header.Get("Pragma") != "no-cache" {
		t.Fatalf("OAuth response cache policy: %+v", res.Header)
	}
}

func TestCallbackRejectsOversizedAuthorizationCodeBeforeProvider(t *testing.T) {
	google := newFakeGoogle(t, userinfo{Sub: "sub-large-code", Email: "large@example.com"})
	app := newTestApp(t, google)
	flow := startFlow(t, app, "localhost:3000")
	res := completeCallback(
		t,
		app,
		"code="+strings.Repeat("a", maxAuthorizationCodeBytes+1)+
			"&state="+url.QueryEscape(flow.state),
		flow.callbackCookie,
	)
	assertAPIError(t, res, http.StatusBadRequest, "invalid_code")
	if google.verifier != "" {
		t.Fatal("oversized authorization code reached provider")
	}
}

func TestCallbackRejectsMismatchedBrowserCookie(t *testing.T) {
	google := newFakeGoogle(t, userinfo{Sub: "sub-mismatch", Email: "mismatch@example.com"})
	app := newTestApp(t, google)
	flow := startFlow(t, app, "localhost:3000")
	other := startFlow(t, app, "localhost:3000")
	mismatched := *other.callbackCookie
	mismatched.Name = flow.callbackCookie.Name

	res := completeCallback(
		t,
		app,
		"code=granted&state="+url.QueryEscape(flow.state),
		&mismatched,
	)

	assertAPIError(t, res, http.StatusBadRequest, "invalid_state")
	if google.verifier != "" {
		t.Fatal("mismatched callback cookie reached provider")
	}
}

func TestParallelCanonicalFlowsRemainIndependent(t *testing.T) {
	google := newFakeGoogle(t, userinfo{Sub: "sub-parallel", Email: "parallel@example.com"})
	app := newTestApp(t, google)
	first := startFlow(t, app, "localhost:3000")
	second := startFlow(t, app, "localhost:3000")
	if first.callbackCookie.Name == second.callbackCookie.Name {
		t.Fatal("parallel flows reused a binding cookie")
	}

	for _, flow := range []authFlow{first, second} {
		res := completeCallback(
			t,
			app,
			"code=granted&state="+url.QueryEscape(flow.state),
			flow.callbackCookie,
		)
		if res.StatusCode != http.StatusFound {
			t.Fatalf("parallel callback returned %d", res.StatusCode)
		}
		sessionFromResponse(t, res)
	}
}

func TestPreviewBootstrapRejectsMovedConfirmation(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)
	start := do(t, app, http.MethodGet, "/v1/auth/google?redirect=/prep", testPreviewHost)
	canonical := followOAuthRedirect(t, app, start.Header.Get("Location"))

	confirmation, err := url.Parse(canonical.Header.Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	res := do(t, app, http.MethodGet, confirmation.RequestURI(), confirmation.Host)

	assertAPIError(t, res, http.StatusBadRequest, "invalid_state")
}

func TestPreviewExchangeRejectsMovedHandoffWithoutConsumingIt(t *testing.T) {
	google := newFakeGoogle(t, userinfo{Sub: "sub-moved-handoff", Email: "moved-handoff@example.com"})
	app := newTestApp(t, google)
	flow := startFlow(t, app, testPreviewHost)
	callback := completeCallback(
		t,
		app,
		"code=granted&state="+url.QueryEscape(flow.state),
		flow.callbackCookie,
	)
	handoff, err := url.Parse(callback.Header.Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	exchange := "/v1/auth/exchange?" + handoff.RawQuery

	moved := do(t, app, http.MethodGet, exchange, testPreviewHost)
	assertAPIError(t, moved, http.StatusBadRequest, "invalid_code")
	assertNoSessionCookie(t, moved)

	legitimate := do(t, app, http.MethodGet, exchange, testPreviewHost, flow.handoffCookie)
	if legitimate.StatusCode != http.StatusFound {
		t.Fatalf("legitimate exchange after moved attempt returned %d", legitimate.StatusCode)
	}
	sessionFromResponse(t, legitimate)
}

func TestPreviewExchangeRejectsMalformedCodeWithoutConsumingValidHandoff(t *testing.T) {
	google := newFakeGoogle(t, userinfo{Sub: "sub-code-shape", Email: "shape@example.com"})
	app := newTestApp(t, google)
	flow := startFlow(t, app, testPreviewHost)
	callback := completeCallback(
		t,
		app,
		"code=granted&state="+url.QueryEscape(flow.state),
		flow.callbackCookie,
	)
	handoff, err := url.Parse(callback.Header.Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	query := handoff.Query()
	validCode := query.Get("code")
	query.Set("code", strings.Repeat("a", 4096))
	malformed := do(
		t,
		app,
		http.MethodGet,
		"/v1/auth/exchange?"+query.Encode(),
		testPreviewHost,
		flow.handoffCookie,
	)
	assertAPIError(t, malformed, http.StatusBadRequest, "invalid_code")

	query.Set("code", validCode)
	legitimate := do(
		t,
		app,
		http.MethodGet,
		"/v1/auth/exchange?"+query.Encode(),
		testPreviewHost,
		flow.handoffCookie,
	)
	if legitimate.StatusCode != http.StatusFound {
		t.Fatalf("legitimate handoff returned %d", legitimate.StatusCode)
	}
}

func TestLegacyAndBrowserBoundHandoffHashesAreIsolated(t *testing.T) {
	code, legacyHash, err := newSecret()
	if err != nil {
		t.Fatal(err)
	}
	currentHash := hashHandoffCode(code)
	if string(currentHash) == string(legacyHash) {
		t.Fatal("browser-bound handoff reused the legacy hash domain")
	}
}

func TestSecureOAuthBindingCookieAttributes(t *testing.T) {
	binding, cookie := newTestOAuthBinding(t, "https://doindeksa.rs")
	if cookie.Name != secureBindingCookiePrefix+binding.ID || !cookie.Secure ||
		!cookie.HttpOnly || cookie.Path != "/" || cookie.SameSite != http.SameSiteLaxMode ||
		cookie.MaxAge != int(oauthBindingTTL.Seconds()) || cookie.Domain != "" {
		t.Fatalf("unexpected binding cookie: %+v", cookie)
	}
}

func TestTerminalCallbackClearsOnlyItsBindingCookie(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)
	flow := startFlow(t, app, "localhost:3000")
	other := startFlow(t, app, "localhost:3000")

	res := completeCallback(
		t,
		app,
		"error=access_denied&state="+url.QueryEscape(flow.state),
		flow.callbackCookie,
		other.callbackCookie,
	)

	if res.StatusCode != http.StatusFound {
		t.Fatalf("cancelled callback returned %d", res.StatusCode)
	}
	assertClearedOAuthCookie(t, res, flow.callbackCookie.Name)
	for _, cookie := range res.Cookies() {
		if cookie.Name == other.callbackCookie.Name {
			t.Fatal("callback cleared another flow's binding cookie")
		}
	}
}

func TestSuccessfulExchangeClearsHandoffBindingCookie(t *testing.T) {
	google := newFakeGoogle(t, userinfo{Sub: "sub-clear-handoff", Email: "clear@example.com"})
	app := newTestApp(t, google)
	flow := startFlow(t, app, testPreviewHost)
	callback := completeCallback(
		t,
		app,
		"code=granted&state="+url.QueryEscape(flow.state),
		flow.callbackCookie,
	)
	handoff, err := url.Parse(callback.Header.Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	res := do(
		t,
		app,
		http.MethodGet,
		"/v1/auth/exchange?"+handoff.RawQuery,
		testPreviewHost,
		flow.handoffCookie,
	)

	if res.StatusCode != http.StatusFound {
		t.Fatalf("exchange returned %d", res.StatusCode)
	}
	assertClearedOAuthCookie(t, res, flow.handoffCookie.Name)
}

func TestPreviewCancellationClearsBothBindingCookies(t *testing.T) {
	google := newFakeGoogle(t, userinfo{})
	app := newTestApp(t, google)
	flow := startFlow(t, app, testPreviewHost)
	callback := completeCallback(
		t,
		app,
		"error=access_denied&state="+url.QueryEscape(flow.state),
		flow.callbackCookie,
	)
	if callback.StatusCode != http.StatusFound {
		t.Fatalf("cancelled callback returned %d", callback.StatusCode)
	}
	assertClearedOAuthCookie(t, callback, flow.callbackCookie.Name)

	cancelURL, err := url.Parse(callback.Header.Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	moved := do(t, app, http.MethodGet, cancelURL.RequestURI(), cancelURL.Host)
	assertAPIError(t, moved, http.StatusBadRequest, "invalid_state")
	legitimate := do(
		t,
		app,
		http.MethodGet,
		cancelURL.RequestURI(),
		cancelURL.Host,
		flow.handoffCookie,
	)
	if legitimate.StatusCode != http.StatusFound || legitimate.Header.Get("Location") != "/prep" {
		t.Fatalf(
			"legitimate cancellation returned %d with location %q",
			legitimate.StatusCode,
			legitimate.Header.Get("Location"),
		)
	}
	assertClearedOAuthCookie(t, legitimate, flow.handoffCookie.Name)
}

func assertClearedOAuthCookie(t *testing.T, res *http.Response, name string) {
	t.Helper()
	for _, cookie := range res.Cookies() {
		if cookie.Name == name {
			if cookie.Value != "" || cookie.MaxAge >= 0 || cookie.Path != "/" {
				t.Fatalf("binding cookie not cleared: %+v", cookie)
			}
			return
		}
	}
	t.Fatalf("binding cookie %q was not cleared", name)
}

func assertAPIError(t *testing.T, res *http.Response, status int, code string) {
	t.Helper()
	if res.StatusCode != status || res.Header.Get("Location") != "" {
		t.Fatalf("response returned %d with location %q", res.StatusCode, res.Header.Get("Location"))
	}
	if contentType := res.Header.Get("Content-Type"); !strings.HasPrefix(contentType, "application/json") {
		t.Fatalf("response content type = %q", contentType)
	}
	var apiErr api.Error
	if err := json.NewDecoder(res.Body).Decode(&apiErr); err != nil {
		t.Fatal(err)
	}
	if apiErr.Code != code {
		t.Fatalf("error code = %q, want %q", apiErr.Code, code)
	}
}
