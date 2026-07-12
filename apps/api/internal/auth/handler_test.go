package auth

import (
	"net/http/httptest"
	"testing"
)

func TestSanitizeRedirect(t *testing.T) {
	path := func(s string) *string { return &s }
	tests := []struct {
		name     string
		redirect *string
		want     string
	}{
		{"nil", nil, "/"},
		{"relative path", path("/prep"), "/prep"},
		{"absolute url", path("https://evil.example"), "/"},
		{"scheme-relative", path("//evil.example"), "/"},
		{"empty", path(""), "/"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sanitizeRedirect(tt.redirect); got != tt.want {
				t.Fatalf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestRequestOrigin(t *testing.T) {
	tests := []struct {
		name    string
		host    string
		headers map[string]string
		want    string
	}{
		{"plain host", "api.internal", nil, "https://api.internal"},
		{"localhost", "localhost:8080", nil, "http://localhost:8080"},
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
		{"http://do-indeksa-abc123-scope.vercel.app", false},
		{"https://evil-scope.vercel.app.evil.example", false},
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
