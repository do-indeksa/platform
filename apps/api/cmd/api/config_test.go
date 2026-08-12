package main

import (
	"strings"
	"testing"
)

func TestAuthConfigValidatesOriginEnvironment(t *testing.T) {
	tests := []struct {
		name          string
		canonical     string
		extraOrigins  string
		previewSuffix string
		wantExtras    []string
		wantError     string
	}{
		{
			name:          "production origins",
			canonical:     "https://doindeksa.rs",
			extraOrigins:  "https://test.doindeksa.rs,https://review.doindeksa.rs",
			previewSuffix: "-scope.vercel.app",
			wantExtras:    []string{"https://test.doindeksa.rs", "https://review.doindeksa.rs"},
		},
		{
			name:      "local development",
			canonical: "http://localhost:3000",
		},
		{
			name:         "empty CSV element",
			canonical:    "https://doindeksa.rs",
			extraOrigins: "https://test.doindeksa.rs,",
			wantError:    "EXTRA_WEB_ORIGINS[1]",
		},
		{
			name:         "CSV whitespace is not normalized silently",
			canonical:    "https://doindeksa.rs",
			extraOrigins: "https://test.doindeksa.rs, https://review.doindeksa.rs",
			wantError:    "EXTRA_WEB_ORIGINS[1]",
		},
		{
			name:          "provider-wide preview suffix",
			canonical:     "https://doindeksa.rs",
			previewSuffix: ".vercel.app",
			wantError:     "PREVIEW_ORIGIN_SUFFIX",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("AUTH_SECRET", strings.Repeat("00", 32))
			t.Setenv("GOOGLE_CLIENT_ID", "client-id")
			t.Setenv("GOOGLE_CLIENT_SECRET", "client-secret")
			t.Setenv("CANONICAL_WEB_ORIGIN", tt.canonical)
			t.Setenv("EXTRA_WEB_ORIGINS", tt.extraOrigins)
			t.Setenv("PREVIEW_ORIGIN_SUFFIX", tt.previewSuffix)

			cfg, err := authConfig()
			if tt.wantError != "" {
				if err == nil || !strings.Contains(err.Error(), tt.wantError) {
					t.Fatalf("authConfig() error = %v, want substring %q", err, tt.wantError)
				}
				return
			}
			if err != nil {
				t.Fatalf("authConfig() error = %v", err)
			}
			if strings.Join(cfg.ExtraOrigins, ",") != strings.Join(tt.wantExtras, ",") {
				t.Fatalf("extra origins = %#v, want %#v", cfg.ExtraOrigins, tt.wantExtras)
			}
		})
	}
}

func TestRunValidatesOriginConfigBeforeDatabase(t *testing.T) {
	t.Setenv("AUTH_SECRET", strings.Repeat("00", 32))
	t.Setenv("GOOGLE_CLIENT_ID", "client-id")
	t.Setenv("GOOGLE_CLIENT_SECRET", "client-secret")
	t.Setenv("CANONICAL_WEB_ORIGIN", "https://doindeksa.rs/path")
	t.Setenv("EXTRA_WEB_ORIGINS", "")
	t.Setenv("PREVIEW_ORIGIN_SUFFIX", "")
	t.Setenv("DATABASE_URL", "://invalid-database-url")

	err := run()

	if err == nil || !strings.Contains(err.Error(), "CANONICAL_WEB_ORIGIN") {
		t.Fatalf("run() error = %v, want origin validation before database parsing", err)
	}
}
