package httpx

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSecurityHeaders(t *testing.T) {
	t.Parallel()

	for _, tt := range []struct {
		name     string
		secure   bool
		wantHSTS string
	}{
		{name: "HTTPS deployment", secure: true, wantHSTS: "max-age=31536000"},
		{name: "local HTTP deployment"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			nextCalled := false
			handler := SecurityHeaders(tt.secure)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				nextCalled = true
				w.WriteHeader(http.StatusNoContent)
			}))
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/resource", nil))

			if !nextCalled || response.Code != http.StatusNoContent {
				t.Fatalf("next = %v, status = %d", nextCalled, response.Code)
			}
			assertSecurityHeaders(t, response.Header(), tt.wantHSTS)
		})
	}
}

func assertSecurityHeaders(t *testing.T, headers http.Header, wantHSTS string) {
	t.Helper()

	want := map[string]string{
		"Content-Security-Policy":           "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none';",
		"Cross-Origin-Resource-Policy":      "same-origin",
		"Permissions-Policy":                "camera=(), display-capture=(), geolocation=(), microphone=(), payment=(), usb=()",
		"Referrer-Policy":                   "no-referrer",
		"Strict-Transport-Security":         wantHSTS,
		"X-Content-Type-Options":            "nosniff",
		"X-Frame-Options":                   "DENY",
		"X-Permitted-Cross-Domain-Policies": "none",
	}
	for name, value := range want {
		if got := headers.Get(name); got != value {
			t.Errorf("%s = %q, want %q", name, got, value)
		}
	}
}
