package auth

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRequestOrigin(t *testing.T) {
	tests := []struct {
		name    string
		host    string
		headers map[string]string
		want    string
	}{
		{"plain host", "api.internal", nil, "https://api.internal"},
		{"localhost", "localhost:8080", nil, "http://localhost:8080"},
		{"uppercase localhost", "LOCALHOST:8080", nil, "http://LOCALHOST:8080"},
		{"IPv4 loopback", "127.0.0.1:8080", nil, "http://127.0.0.1:8080"},
		{"IPv6 loopback", "[::1]:8080", nil, "http://[::1]:8080"},
		{"non-loopback IP", "192.0.2.1:8080", nil, "https://192.0.2.1:8080"},
		{
			"behind proxy",
			"api.internal",
			map[string]string{"X-Forwarded-Host": "doindeksa.rs", "X-Forwarded-Proto": "https"},
			"https://doindeksa.rs",
		},
		{
			"forwarded host only",
			"api.internal",
			map[string]string{"X-Forwarded-Host": "preview.vercel.app"},
			"https://preview.vercel.app",
		},
		{
			"own header wins over edge-rewritten forwarded host",
			"api.internal",
			map[string]string{
				"X-Di-Forwarded-Origin": "https://do-indeksa.vercel.app",
				"X-Forwarded-Host":      "api.edge.example",
			},
			"https://do-indeksa.vercel.app",
		},
		{
			"own header carries scheme verbatim",
			"api.internal",
			map[string]string{"X-Di-Forwarded-Origin": "http://localhost:3000"},
			"http://localhost:3000",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest("GET", "/", nil)
			r.Host = tt.host
			for k, v := range tt.headers {
				r.Header.Set(k, v)
			}
			if got := requestOrigin(r); got != tt.want {
				t.Fatalf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestSessionCookiePolicy(t *testing.T) {
	tests := []struct {
		canonical string
		wantName  string
		secure    bool
	}{
		{"https://doindeksa.rs", SessionCookieName, true},
		{"http://localhost:3000", localSessionCookieName, false},
	}
	for _, tt := range tests {
		t.Run(tt.canonical, func(t *testing.T) {
			svc := &Service{cfg: Config{CanonicalOrigin: tt.canonical}}
			cookie := svc.sessionCookie("t", 1)
			if cookie.Name != tt.wantName || cookie.Secure != tt.secure ||
				cookie.Path != "/" || cookie.Domain != "" || !cookie.HttpOnly ||
				cookie.SameSite != http.SameSiteLaxMode {
				t.Fatalf("unexpected cookie policy: %+v", cookie)
			}
		})
	}
}

func TestHTTPSHandlersIgnoreLegacySessionCookie(t *testing.T) {
	service := NewService(testPool, Config{CanonicalOrigin: "https://doindeksa.rs"})
	handler := NewHandler(service)
	legacyCookie := seedSession(t, time.Now().Add(time.Hour))

	meRequest := httptest.NewRequest(http.MethodGet, "/v1/me", nil)
	meRequest.AddCookie(legacyCookie)
	meResponse := httptest.NewRecorder()
	handler.GetMe(meResponse, meRequest)
	if meResponse.Code != http.StatusUnauthorized {
		t.Fatalf("legacy cookie authenticated HTTPS handler: %d", meResponse.Code)
	}

	logoutRequest := httptest.NewRequest(http.MethodPost, "/v1/auth/logout", nil)
	logoutRequest.AddCookie(legacyCookie)
	logoutResponse := httptest.NewRecorder()
	handler.Logout(logoutResponse, logoutRequest)
	if logoutResponse.Code != http.StatusNoContent {
		t.Fatalf("logout returned %d", logoutResponse.Code)
	}
	cookies := logoutResponse.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != SessionCookieName ||
		!cookies[0].Secure || cookies[0].MaxAge >= 0 {
		t.Fatalf("unexpected logout cookie: %+v", cookies)
	}
	if _, _, err := service.SessionUser(context.Background(), legacyCookie.Value); err != nil {
		t.Fatalf("legacy cookie revoked server-side session: %v", err)
	}
}

func TestOriginAllowed(t *testing.T) {
	svc := &Service{cfg: Config{
		CanonicalOrigin:     "https://doindeksa.rs",
		ExtraOrigins:        []string{"https://test.doindeksa.rs"},
		PreviewOriginSuffix: "-scope.vercel.app",
	}}
	tests := []struct {
		origin string
		want   bool
	}{
		{"https://doindeksa.rs", true},
		{"https://test.doindeksa.rs", true},
		{"https://do-indeksa-abc123-scope.vercel.app", true},
		{"HTTPS://DO-INDEKSA-ABC123-SCOPE.VERCEL.APP:443/", true},
		{"HTTPS://TEST.DOINDEKSA.RS:443/", true},
		{"http://do-indeksa-abc123-scope.vercel.app", false},
		{"https://evil-scope.vercel.app.evil.example", false},
		{"https://evil.example/-scope.vercel.app", false},
		{"https://evil.example?next=-scope.vercel.app", false},
		{"https://evil.example#-scope.vercel.app", false},
		{"https://user@do-indeksa-abc123-scope.vercel.app", false},
		{"https://do-indeksa-abc123-scope.vercel.app:444/-scope.vercel.app", false},
		{"https://do-indeksa-abc123-scope.vercel.app?", false},
		{"https://do-indeksa-abc123-scope.vercel.app#", false},
		{"https://evil.example", false},
		{"", false},
	}
	for _, tt := range tests {
		t.Run(tt.origin, func(t *testing.T) {
			if got := svc.originAllowed(tt.origin); got != tt.want {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}
