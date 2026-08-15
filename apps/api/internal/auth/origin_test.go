package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCookieMutationOriginMiddleware(t *testing.T) {
	t.Parallel()
	service := &Service{cfg: Config{
		CanonicalOrigin:     "https://doindeksa.rs",
		ExtraOrigins:        []string{"https://test.doindeksa.rs"},
		PreviewOriginSuffix: "-scope.vercel.app",
	}}

	tests := []struct {
		name       string
		method     string
		cookie     bool
		host       string
		headers    map[string]string
		wantStatus int
		wantNext   bool
	}{
		{
			name:       "safe request stays available cross-site",
			method:     http.MethodGet,
			cookie:     true,
			host:       "doindeksa.rs",
			headers:    map[string]string{"Sec-Fetch-Site": "cross-site"},
			wantStatus: http.StatusNoContent,
			wantNext:   true,
		},
		{
			name:       "unauthenticated mutation reaches endpoint authentication",
			method:     http.MethodPost,
			host:       "doindeksa.rs",
			headers:    map[string]string{"Origin": "https://evil.example"},
			wantStatus: http.StatusNoContent,
			wantNext:   true,
		},
		{
			name:   "canonical origin",
			method: http.MethodPost,
			cookie: true,
			host:   "api.internal",
			headers: map[string]string{
				"Origin":            "https://doindeksa.rs",
				"X-Forwarded-Host":  "doindeksa.rs",
				"X-Forwarded-Proto": "https",
			},
			wantStatus: http.StatusNoContent,
			wantNext:   true,
		},
		{
			name:   "next rewrite origin",
			method: http.MethodPost,
			cookie: true,
			host:   "api.internal",
			headers: map[string]string{
				"Origin":                "https://do-indeksa-abc-scope.vercel.app",
				"X-Di-Forwarded-Origin": "https://do-indeksa-abc-scope.vercel.app",
			},
			wantStatus: http.StatusNoContent,
			wantNext:   true,
		},
		{
			name:   "referer fallback",
			method: http.MethodPost,
			cookie: true,
			host:   "api.internal",
			headers: map[string]string{
				"Referer":           "https://doindeksa.rs/en/tasks?topic=log",
				"X-Forwarded-Host":  "doindeksa.rs",
				"X-Forwarded-Proto": "https, http",
			},
			wantStatus: http.StatusNoContent,
			wantNext:   true,
		},
		{
			name:   "fetch metadata rejects cross-site",
			method: http.MethodPost,
			cookie: true,
			host:   "doindeksa.rs",
			headers: map[string]string{
				"Origin":         "https://doindeksa.rs",
				"Sec-Fetch-Site": "cross-site",
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:   "foreign origin",
			method: http.MethodPost,
			cookie: true,
			host:   "doindeksa.rs",
			headers: map[string]string{
				"Origin": "https://evil.example",
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:   "same-site sibling is not same-origin",
			method: http.MethodPost,
			cookie: true,
			host:   "doindeksa.rs",
			headers: map[string]string{
				"Origin":         "https://evil.doindeksa.rs",
				"Sec-Fetch-Site": "same-site",
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:       "missing source origin",
			method:     http.MethodPost,
			cookie:     true,
			host:       "doindeksa.rs",
			wantStatus: http.StatusForbidden,
		},
		{
			name:   "unrecognized target origin",
			method: http.MethodPost,
			cookie: true,
			host:   "evil.example",
			headers: map[string]string{
				"Origin": "https://evil.example",
			},
			wantStatus: http.StatusForbidden,
		},
		{
			name:   "referer userinfo is rejected",
			method: http.MethodPost,
			cookie: true,
			host:   "doindeksa.rs",
			headers: map[string]string{
				"Referer": "https://attacker@doindeksa.rs/tasks",
			},
			wantStatus: http.StatusForbidden,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			nextCalled := false
			handler := CookieMutationOriginMiddleware(service)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				nextCalled = true
				w.WriteHeader(http.StatusNoContent)
			}))
			request := httptest.NewRequest(tt.method, "https://api.internal/resource", nil)
			request.Host = tt.host
			for name, value := range tt.headers {
				request.Header.Set(name, value)
			}
			if tt.cookie {
				request.AddCookie(&http.Cookie{Name: SessionCookieName, Value: "session"})
			}
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != tt.wantStatus || nextCalled != tt.wantNext {
				t.Fatalf("status = %d, next = %v; want %d, %v", response.Code, nextCalled, tt.wantStatus, tt.wantNext)
			}
			if !tt.wantNext && (response.Header().Get("Vary") == "" || response.Header().Get("Content-Type") != "application/json") {
				t.Fatalf("missing security response headers: %+v", response.Header())
			}
		})
	}
}

func TestNormalizeOrigin(t *testing.T) {
	t.Parallel()
	tests := []struct {
		raw  string
		want string
		ok   bool
	}{
		{"HTTPS://DoIndeksa.RS:443", "https://doindeksa.rs", true},
		{"http://localhost:80/", "http://localhost", true},
		{"http://[::1]:3000", "http://[::1]:3000", true},
		{"https://doindeksa.rs/path", "", false},
		{"https://user@doindeksa.rs", "", false},
		{"null", "", false},
		{"javascript:alert(1)", "", false},
	}
	for _, tt := range tests {
		t.Run(tt.raw, func(t *testing.T) {
			got, ok := normalizeOrigin(tt.raw)
			if got != tt.want || ok != tt.ok {
				t.Fatalf("normalizeOrigin(%q) = %q, %v; want %q, %v", tt.raw, got, ok, tt.want, tt.ok)
			}
		})
	}
}
