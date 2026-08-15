package auth

import (
	"strings"
	"testing"
)

func TestValidateConfig(t *testing.T) {
	t.Parallel()
	base := Config{
		CanonicalOrigin:     "https://doindeksa.rs",
		ExtraOrigins:        []string{"https://test.doindeksa.rs"},
		PreviewOriginSuffix: "-scope.vercel.app",
	}
	tests := []struct {
		name        string
		mutate      func(*Config)
		wantError   string
		wantSuccess bool
	}{
		{name: "production", wantSuccess: true},
		{
			name: "preview wildcard disabled",
			mutate: func(cfg *Config) {
				cfg.PreviewOriginSuffix = ""
			},
			wantSuccess: true,
		},
		{
			name: "localhost development",
			mutate: func(cfg *Config) {
				cfg.CanonicalOrigin = "http://localhost:3000"
			},
			wantSuccess: true,
		},
		{
			name: "IPv4 loopback development",
			mutate: func(cfg *Config) {
				cfg.CanonicalOrigin = "http://127.0.0.1:3000"
			},
			wantSuccess: true,
		},
		{
			name: "IPv6 loopback development",
			mutate: func(cfg *Config) {
				cfg.CanonicalOrigin = "http://[::1]:3000"
			},
			wantSuccess: true,
		},
		{
			name: "missing canonical",
			mutate: func(cfg *Config) {
				cfg.CanonicalOrigin = ""
			},
			wantError: "CANONICAL_WEB_ORIGIN",
		},
		{
			name: "non-loopback HTTP",
			mutate: func(cfg *Config) {
				cfg.CanonicalOrigin = "http://doindeksa.rs"
			},
			wantError: "HTTPS",
		},
		{
			name: "trailing slash",
			mutate: func(cfg *Config) {
				cfg.CanonicalOrigin = "https://doindeksa.rs/"
			},
			wantError: "canonical lowercase form",
		},
		{
			name: "default port",
			mutate: func(cfg *Config) {
				cfg.CanonicalOrigin = "https://doindeksa.rs:443"
			},
			wantError: "canonical lowercase form",
		},
		{
			name: "uppercase hostname",
			mutate: func(cfg *Config) {
				cfg.CanonicalOrigin = "https://DoIndeksa.RS"
			},
			wantError: "canonical lowercase form",
		},
		{
			name: "userinfo",
			mutate: func(cfg *Config) {
				cfg.CanonicalOrigin = "https://user@doindeksa.rs"
			},
			wantError: "without credentials",
		},
		{
			name: "query",
			mutate: func(cfg *Config) {
				cfg.CanonicalOrigin = "https://doindeksa.rs?"
			},
			wantError: "without credentials",
		},
		{
			name: "duplicate canonical extra",
			mutate: func(cfg *Config) {
				cfg.ExtraOrigins = []string{"https://doindeksa.rs"}
			},
			wantError: "duplicates CANONICAL_WEB_ORIGIN",
		},
		{
			name: "duplicate extras",
			mutate: func(cfg *Config) {
				cfg.ExtraOrigins = []string{"https://test.doindeksa.rs", "https://test.doindeksa.rs"}
			},
			wantError: "duplicates EXTRA_WEB_ORIGINS[0]",
		},
		{
			name: "extra whitespace",
			mutate: func(cfg *Config) {
				cfg.ExtraOrigins = []string{" https://test.doindeksa.rs"}
			},
			wantError: "EXTRA_WEB_ORIGINS[0]",
		},
		{
			name: "suffix uppercase",
			mutate: func(cfg *Config) {
				cfg.PreviewOriginSuffix = "-scope.VERCEL.app"
			},
			wantError: "PREVIEW_ORIGIN_SUFFIX",
		},
		{
			name: "suffix without boundary",
			mutate: func(cfg *Config) {
				cfg.PreviewOriginSuffix = "scope.vercel.app"
			},
			wantError: "PREVIEW_ORIGIN_SUFFIX",
		},
		{
			name: "public suffix too broad",
			mutate: func(cfg *Config) {
				cfg.PreviewOriginSuffix = ".vercel.app"
			},
			wantError: "PREVIEW_ORIGIN_SUFFIX",
		},
		{
			name: "suffix matches canonical",
			mutate: func(cfg *Config) {
				cfg.CanonicalOrigin = "https://app-scope.vercel.app"
			},
			wantError: "CANONICAL_WEB_ORIGIN",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := base
			cfg.ExtraOrigins = append([]string(nil), base.ExtraOrigins...)
			if tt.mutate != nil {
				tt.mutate(&cfg)
			}
			err := ValidateConfig(cfg)
			if tt.wantSuccess {
				if err != nil {
					t.Fatalf("ValidateConfig() error = %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tt.wantError) {
				t.Fatalf("ValidateConfig() error = %v, want substring %q", err, tt.wantError)
			}
		})
	}
}
