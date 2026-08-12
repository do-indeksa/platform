package auth

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"

	"golang.org/x/oauth2"
)

const (
	testAuthorizationCode = "authorization-code-secret"
	testCodeVerifier      = "code-verifier-secret"
	testAccessToken       = "access-token-secret"
)

func newOAuthUpstreamTestService(baseURL string) *Service {
	service := NewService(testPool, Config{
		ClientID:        "client-id",
		ClientSecret:    "client-secret",
		Secret:          testKey,
		CanonicalOrigin: testCanonical,
	})
	service.endpoint = oauth2.Endpoint{
		AuthURL:  baseURL + "/auth",
		TokenURL: baseURL + "/token",
	}
	service.userinfoURL = baseURL + "/userinfo"
	return service
}

func writeTestToken(w http.ResponseWriter) {
	w.Header().Set("Content-Type", "application/json")
	_, _ = fmt.Fprintf(
		w,
		`{"access_token":%q,"token_type":"Bearer","expires_in":3600}`,
		testAccessToken,
	)
}

func assertOAuthErrorSanitized(t *testing.T, err, target error, markers ...string) {
	t.Helper()
	if !errors.Is(err, target) {
		t.Fatalf("error = %v, want %v", err, target)
	}
	for _, marker := range markers {
		if strings.Contains(err.Error(), marker) {
			t.Fatalf("error exposes %q: %v", marker, err)
		}
	}
}

func TestOAuthTokenFailuresAreSanitized(t *testing.T) {
	tests := []struct {
		name   string
		status int
		body   string
		want   error
	}{
		{
			name:   "rejected code",
			status: http.StatusBadRequest,
			body:   `{"error":"invalid_grant","error_description":"token-response-secret"}`,
			want:   ErrCodeRejected,
		},
		{
			name:   "provider failure",
			status: http.StatusInternalServerError,
			body:   "token-provider-body-secret",
			want:   ErrProviderUnavailable,
		},
		{
			name:   "provider rejects client configuration",
			status: http.StatusBadRequest,
			body:   `{"error":"invalid_client","error_description":"token-client-secret"}`,
			want:   ErrProviderUnavailable,
		},
		{
			name:   "malformed success",
			status: http.StatusOK,
			body:   `{"access_token":"token-json-secret"`,
			want:   ErrProviderUnavailable,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mux := http.NewServeMux()
			mux.HandleFunc("POST /token", func(w http.ResponseWriter, r *http.Request) {
				if err := r.ParseForm(); err != nil {
					t.Error(err)
				}
				if r.Form.Get("code") != testAuthorizationCode || r.Form.Get("code_verifier") != testCodeVerifier {
					t.Errorf("token request did not carry the expected code and verifier")
				}
				w.Header().Set("Content-Type", "application/json")
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
				tt.want,
				testAuthorizationCode,
				testCodeVerifier,
				"token-response-secret",
				"token-provider-body-secret",
				"token-client-secret",
				"token-json-secret",
			)
		})
	}
}

func TestOAuthURLAndTransportErrorsAreSanitized(t *testing.T) {
	t.Run("token URL", func(t *testing.T) {
		service := newOAuthUpstreamTestService("https://provider.example")
		service.endpoint.TokenURL = "://token-url-secret"

		_, err := service.CompleteGoogleSignIn(context.Background(), testAuthorizationCode, testCodeVerifier)

		assertOAuthErrorSanitized(t, err, ErrProviderUnavailable, "token-url-secret", testAuthorizationCode, testCodeVerifier)
	})

	t.Run("userinfo URL", func(t *testing.T) {
		mux := http.NewServeMux()
		mux.HandleFunc("POST /token", func(w http.ResponseWriter, _ *http.Request) { writeTestToken(w) })
		server := httptest.NewServer(mux)
		t.Cleanup(server.Close)
		service := newOAuthUpstreamTestService(server.URL)
		service.userinfoURL = "://userinfo-url-secret"

		_, err := service.CompleteGoogleSignIn(context.Background(), testAuthorizationCode, testCodeVerifier)

		assertOAuthErrorSanitized(t, err, ErrProviderUnavailable, "userinfo-url-secret", testAccessToken)
	})

	t.Run("transport", func(t *testing.T) {
		service := newOAuthUpstreamTestService("https://provider.example")
		service.upstreamClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
			if r.Body != nil {
				_ = r.Body.Close()
			}
			return nil, errors.New("transport-error-secret")
		})}

		_, err := service.CompleteGoogleSignIn(context.Background(), testAuthorizationCode, testCodeVerifier)

		assertOAuthErrorSanitized(t, err, ErrProviderUnavailable, "transport-error-secret", testAuthorizationCode, testCodeVerifier)
	})
}

func TestOAuthTokenRequestKeepsSecretsOutOfURL(t *testing.T) {
	var requestURL string
	transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		requestURL = r.URL.String()
		body, err := io.ReadAll(r.Body)
		if err != nil {
			return nil, err
		}
		_ = r.Body.Close()
		form, err := url.ParseQuery(string(body))
		if err != nil {
			return nil, err
		}
		if form.Get("code") != testAuthorizationCode || form.Get("code_verifier") != testCodeVerifier {
			return nil, errors.New("missing OAuth form secrets")
		}
		return testHTTPResponse(
			r,
			http.StatusInternalServerError,
			nil,
			io.NopCloser(strings.NewReader("provider-body-secret")),
		), nil
	})
	service := newOAuthUpstreamTestService("https://provider.example")
	service.upstreamClient = &http.Client{Transport: transport}

	_, err := service.CompleteGoogleSignIn(context.Background(), testAuthorizationCode, testCodeVerifier)

	assertOAuthErrorSanitized(t, err, ErrProviderUnavailable, "provider-body-secret", testAuthorizationCode, testCodeVerifier)
	if strings.Contains(requestURL, testAuthorizationCode) || strings.Contains(requestURL, testCodeVerifier) {
		t.Fatalf("OAuth secrets were placed in request URL %q", requestURL)
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) {
	return f(r)
}

type trackingBody struct {
	io.Reader
	closed atomic.Bool
}

func (b *trackingBody) Close() error {
	b.closed.Store(true)
	return nil
}

func testHTTPResponse(request *http.Request, status int, headers http.Header, body io.ReadCloser) *http.Response {
	return &http.Response{
		Status:     fmt.Sprintf("%d %s", status, http.StatusText(status)),
		StatusCode: status,
		Header:     headers,
		Body:       body,
		Request:    request,
	}
}
