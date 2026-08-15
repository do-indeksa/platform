package auth

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestOAuthUserinfoResponsesAreBoundedAndStrictlyFramed(t *testing.T) {
	validProfile := `{"sub":"strict-profile","email":"strict-profile@example.com"}`
	tests := []struct {
		name    string
		status  int
		body    string
		headers http.Header
		marker  string
	}{
		{
			name:    "non-200 response",
			status:  http.StatusBadGateway,
			body:    "userinfo-provider-body-secret",
			headers: http.Header{"X-Provider-Debug": {"userinfo-provider-header-secret"}},
			marker:  "userinfo-provider-body-secret",
		},
		{
			name:   "malformed JSON",
			status: http.StatusOK,
			body:   `{"sub":"userinfo-json-secret"`,
			marker: "userinfo-json-secret",
		},
		{
			name:   "trailing JSON",
			status: http.StatusOK,
			body:   validProfile + ` "userinfo-trailing-secret"`,
			marker: "userinfo-trailing-secret",
		},
		{
			name:   "oversized JSON",
			status: http.StatusOK,
			body: `{"sub":"oversized-profile","email":"oversized-profile@example.com","picture":"userinfo-size-secret` +
				strings.Repeat("x", maxUserinfoBodyBytes) + `"}`,
			marker: "userinfo-size-secret",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mux := http.NewServeMux()
			mux.HandleFunc("POST /token", func(w http.ResponseWriter, _ *http.Request) { writeTestToken(w) })
			mux.HandleFunc("GET /userinfo", func(w http.ResponseWriter, _ *http.Request) {
				for name, values := range tt.headers {
					for _, value := range values {
						w.Header().Add(name, value)
					}
				}
				w.WriteHeader(tt.status)
				_, _ = io.WriteString(w, tt.body)
			})
			server := httptest.NewServer(mux)
			t.Cleanup(server.Close)

			_, err := newOAuthUpstreamTestService(server.URL).CompleteGoogleSignIn(
				context.Background(),
				testAuthorizationCode,
				testCodeVerifier,
			)

			assertOAuthErrorSanitized(
				t,
				err,
				ErrProviderUnavailable,
				testAuthorizationCode,
				testCodeVerifier,
				testAccessToken,
				tt.marker,
				"userinfo-provider-header-secret",
			)
		})
	}
}

func TestOAuthUserinfoAllowsUnknownFieldsAndTrailingWhitespace(t *testing.T) {
	profileID := fmt.Sprintf("unknown-fields-%d", time.Now().UnixNano())
	mux := http.NewServeMux()
	mux.HandleFunc("POST /token", func(w http.ResponseWriter, _ *http.Request) { writeTestToken(w) })
	mux.HandleFunc("GET /userinfo", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = fmt.Fprintf(
			w,
			`{"sub":%q,"email":%q,"name":"Unknown Fields","future_claim":{"enabled":true}}  %s`,
			profileID,
			profileID+"@example.com",
			"\n\t",
		)
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	user, err := newOAuthUpstreamTestService(server.URL).CompleteGoogleSignIn(
		context.Background(),
		testAuthorizationCode,
		testCodeVerifier,
	)
	if err != nil {
		t.Fatal(err)
	}
	if user.GoogleSub != profileID || user.Email != profileID+"@example.com" || user.Name != "Unknown Fields" {
		t.Fatalf("unexpected user: %+v", user)
	}
}

func TestOAuthUpstreamClosesResponseBodies(t *testing.T) {
	tokenBody := &trackingBody{Reader: strings.NewReader(`{"access_token":"` + testAccessToken + `","token_type":"Bearer","expires_in":3600}`)}
	userinfoBody := &trackingBody{Reader: strings.NewReader("userinfo-close-secret")}
	transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		if r.Body != nil {
			_ = r.Body.Close()
		}
		switch r.URL.Path {
		case "/token":
			return testHTTPResponse(r, http.StatusOK, http.Header{"Content-Type": {"application/json"}}, tokenBody), nil
		case "/userinfo":
			return testHTTPResponse(r, http.StatusBadGateway, nil, userinfoBody), nil
		default:
			return nil, fmt.Errorf("unexpected path %s", r.URL.Path)
		}
	})
	service := newOAuthUpstreamTestService("https://provider.example")
	service.upstreamClient = &http.Client{Transport: transport, Timeout: time.Second}

	_, err := service.CompleteGoogleSignIn(context.Background(), testAuthorizationCode, testCodeVerifier)

	assertOAuthErrorSanitized(t, err, ErrProviderUnavailable, "userinfo-close-secret", testAccessToken)
	if !tokenBody.closed.Load() || !userinfoBody.closed.Load() {
		t.Fatalf("response bodies not closed: token=%v userinfo=%v", tokenBody.closed.Load(), userinfoBody.closed.Load())
	}
}

func TestOAuthUserinfoRedirectIsNotFollowed(t *testing.T) {
	var redirectFollowed atomic.Bool
	mux := http.NewServeMux()
	mux.HandleFunc("POST /token", func(w http.ResponseWriter, _ *http.Request) { writeTestToken(w) })
	mux.HandleFunc("GET /userinfo", func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "/redirect-target", http.StatusFound)
	})
	mux.HandleFunc("GET /redirect-target", func(w http.ResponseWriter, _ *http.Request) {
		redirectFollowed.Store(true)
		_, _ = io.WriteString(w, `{"sub":"redirected","email":"redirected@example.com"}`)
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)

	_, err := newOAuthUpstreamTestService(server.URL).CompleteGoogleSignIn(
		context.Background(),
		testAuthorizationCode,
		testCodeVerifier,
	)

	assertOAuthErrorSanitized(t, err, ErrProviderUnavailable, testAccessToken)
	if redirectFollowed.Load() {
		t.Fatal("userinfo redirect was followed")
	}
}
