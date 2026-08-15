package auth

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/do-indeksa/platform/apps/api/internal/api"
)

func TestOAuthProviderFailureReturnsStableBadGatewayWithoutLeaks(t *testing.T) {
	const providerMarker = "provider-callback-body-secret"
	mux := http.NewServeMux()
	mux.HandleFunc("POST /token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("X-Provider-Debug", "provider-callback-header-secret")
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = io.WriteString(w, providerMarker)
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	service := newOAuthUpstreamTestService(server.URL)
	sealed, err := sealState(testKey, state{
		Origin:    testCanonical,
		Redirect:  "/prep",
		Verifier:  testCodeVerifier,
		ExpiresAt: time.Now().Add(stateTTL).Unix(),
	})
	if err != nil {
		t.Fatal(err)
	}

	var logs bytes.Buffer
	previousLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(previousLogger) })
	request := httptest.NewRequest(http.MethodGet, "/v1/auth/google/callback", nil)
	response := httptest.NewRecorder()
	code := testAuthorizationCode
	NewHandler(service).GoogleAuthCallback(response, request, api.GoogleAuthCallbackParams{
		Code:  &code,
		State: sealed,
	})

	if response.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusBadGateway, response.Body.String())
	}
	var apiErr api.Error
	if err := json.NewDecoder(response.Body).Decode(&apiErr); err != nil {
		t.Fatal(err)
	}
	if apiErr.Code != "oauth_provider_unavailable" || apiErr.Message != "sign-in provider is temporarily unavailable" {
		t.Fatalf("unexpected API error: %+v", apiErr)
	}
	combined := response.Body.String() + logs.String()
	for _, marker := range []string{
		testAuthorizationCode,
		testCodeVerifier,
		testAccessToken,
		providerMarker,
		"provider-callback-header-secret",
		server.URL,
	} {
		if strings.Contains(combined, marker) {
			t.Fatalf("response or logs expose %q: %s", marker, combined)
		}
	}
}

func TestOAuthInvalidGrantReturnsSanitizedBadRequest(t *testing.T) {
	const providerMarker = "invalid-grant-description-secret"
	mux := http.NewServeMux()
	mux.HandleFunc("POST /token", func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = io.WriteString(
			w,
			`{"error":"invalid_grant","error_description":"`+providerMarker+`"}`,
		)
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	service := newOAuthUpstreamTestService(server.URL)
	sealed, err := sealState(testKey, state{
		Origin:    testCanonical,
		Redirect:  "/prep",
		Verifier:  testCodeVerifier,
		ExpiresAt: time.Now().Add(stateTTL).Unix(),
	})
	if err != nil {
		t.Fatal(err)
	}

	var logs bytes.Buffer
	previousLogger := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(previousLogger) })
	request := httptest.NewRequest(http.MethodGet, "/v1/auth/google/callback", nil)
	response := httptest.NewRecorder()
	code := testAuthorizationCode
	NewHandler(service).GoogleAuthCallback(response, request, api.GoogleAuthCallbackParams{
		Code:  &code,
		State: sealed,
	})

	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d: %s", response.Code, http.StatusBadRequest, response.Body.String())
	}
	var apiErr api.Error
	if err := json.NewDecoder(response.Body).Decode(&apiErr); err != nil {
		t.Fatal(err)
	}
	if apiErr.Code != "invalid_code" || apiErr.Message != "authorization code was rejected" {
		t.Fatalf("unexpected API error: %+v", apiErr)
	}
	combined := response.Body.String() + logs.String()
	for _, marker := range []string{
		testAuthorizationCode,
		testCodeVerifier,
		providerMarker,
		server.URL,
	} {
		if strings.Contains(combined, marker) {
			t.Fatalf("response or logs expose %q: %s", marker, combined)
		}
	}
}
