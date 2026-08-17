package main

import (
	"strings"
	"testing"
)

func TestLoadRuntimeConfigAcceptsValidEnvironment(t *testing.T) {
	tests := []struct {
		name        string
		port        string
		wantAddress string
	}{
		{name: "default port", wantAddress: ":8080"},
		{name: "explicit port", port: "8443", wantAddress: ":8443"},
		{name: "lowest port", port: "1", wantAddress: ":1"},
		{name: "highest port", port: "65535", wantAddress: ":65535"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setValidRuntimeEnvironment(t)
			t.Setenv("PORT", tt.port)

			cfg, err := loadRuntimeConfig()
			if err != nil {
				t.Fatalf("loadRuntimeConfig() error = %v", err)
			}
			if cfg.listenAddress != tt.wantAddress {
				t.Errorf("listen address = %q, want %q", cfg.listenAddress, tt.wantAddress)
			}
			if cfg.database == nil || cfg.database.ConnConfig.Host != "db.internal" {
				t.Fatal("database config was not parsed as expected")
			}
		})
	}
}

func TestLoadRuntimeConfigRejectsDatabaseConfigurationSafely(t *testing.T) {
	tests := []struct {
		name        string
		databaseURL string
		wantError   string
	}{
		{name: "missing", wantError: "DATABASE_URL is required"},
		{name: "whitespace", databaseURL: " \t", wantError: "DATABASE_URL is required"},
		{
			name:        "invalid without parser details",
			databaseURL: "postgresql://api:do-not-log@db.internal:invalid/do_indeksa",
			wantError:   "DATABASE_URL is invalid",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setValidRuntimeEnvironment(t)
			t.Setenv("DATABASE_URL", tt.databaseURL)

			_, err := loadRuntimeConfig()
			if err == nil || err.Error() != tt.wantError {
				t.Fatalf("loadRuntimeConfig() error = %v, want %q", err, tt.wantError)
			}
			for _, sensitive := range []string{tt.databaseURL, "do-not-log", "db.internal"} {
				if sensitive != "" && strings.Contains(err.Error(), sensitive) {
					t.Errorf("configuration error disclosed %q", sensitive)
				}
			}
		})
	}
}

func TestLoadRuntimeConfigRejectsInvalidPorts(t *testing.T) {
	for _, port := range []string{"0", "-1", "+8080", " 8080", "8080 ", "65536", "http"} {
		t.Run(port, func(t *testing.T) {
			setValidRuntimeEnvironment(t)
			t.Setenv("PORT", port)

			_, err := loadRuntimeConfig()
			const want = "PORT must be a decimal number from 1 to 65535"
			if err == nil || err.Error() != want {
				t.Fatalf("loadRuntimeConfig() error = %v, want %q", err, want)
			}
			if strings.Contains(err.Error(), port) {
				t.Errorf("configuration error disclosed invalid port %q", port)
			}
		})
	}
}

func TestLoadRuntimeConfigReportsRequiredValuesInOrder(t *testing.T) {
	tests := []struct {
		name      string
		missing   []string
		wantError string
	}{
		{
			name:      "client ID first",
			missing:   []string{"GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "CANONICAL_WEB_ORIGIN"},
			wantError: "GOOGLE_CLIENT_ID is required",
		},
		{
			name:      "client secret second",
			missing:   []string{"GOOGLE_CLIENT_SECRET", "CANONICAL_WEB_ORIGIN"},
			wantError: "GOOGLE_CLIENT_SECRET is required",
		},
		{
			name:      "canonical origin third",
			missing:   []string{"CANONICAL_WEB_ORIGIN"},
			wantError: "CANONICAL_WEB_ORIGIN is required",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setValidRuntimeEnvironment(t)
			for _, name := range tt.missing {
				t.Setenv(name, "")
			}

			_, err := loadRuntimeConfig()
			if err == nil || err.Error() != tt.wantError {
				t.Fatalf("loadRuntimeConfig() error = %v, want %q", err, tt.wantError)
			}
		})
	}
}

func TestRunRejectsMissingDatabaseURLBeforeStartup(t *testing.T) {
	setValidRuntimeEnvironment(t)
	t.Setenv("DATABASE_URL", "")
	t.Setenv("PGHOST", "ambient-database.invalid")

	err := run()
	if err == nil || err.Error() != "DATABASE_URL is required" {
		t.Fatalf("run() error = %v, want missing DATABASE_URL", err)
	}
}

func setValidRuntimeEnvironment(t *testing.T) {
	t.Helper()
	t.Setenv(
		"DATABASE_URL",
		"postgresql://api:development-only-password@db.internal:5432/do_indeksa?sslmode=require",
	)
	t.Setenv("GOOGLE_CLIENT_ID", "client-id")
	t.Setenv("GOOGLE_CLIENT_SECRET", "client-secret")
	t.Setenv("AUTH_SECRET", strings.Repeat("00", 32))
	t.Setenv("CANONICAL_WEB_ORIGIN", "https://doindeksa.rs")
	t.Setenv("EXTRA_WEB_ORIGINS", "")
	t.Setenv("PREVIEW_ORIGIN_SUFFIX", "")
}
