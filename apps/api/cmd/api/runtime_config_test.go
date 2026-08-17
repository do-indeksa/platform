package main

import (
	"strings"
	"testing"
	"time"
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
			if cfg.database.ConnConfig.ConnectTimeout != defaultDatabaseConnectTimeout {
				t.Fatalf(
					"connect timeout = %v, want %v",
					cfg.database.ConnConfig.ConnectTimeout,
					defaultDatabaseConnectTimeout,
				)
			}
		})
	}
}

func TestLoadRuntimeConfigRejectsDatabaseConfigurationSafely(t *testing.T) {
	tests := []struct {
		name             string
		databaseURL      string
		pgConnectTimeout string
		wantError        string
	}{
		{name: "missing", wantError: "DATABASE_URL is required"},
		{name: "whitespace", databaseURL: " \t", wantError: "DATABASE_URL is required"},
		{
			name:        "invalid without parser details",
			databaseURL: "postgresql://api:do-not-log@db.internal:invalid/do_indeksa",
			wantError:   "DATABASE_URL is invalid",
		},
		{
			name:        "negative URL connection timeout",
			databaseURL: "postgresql://api:do-not-log@db.internal/do_indeksa?connect_timeout=-1",
			wantError:   "DATABASE_URL is invalid",
		},
		{
			name: "negative keyword connection timeout",
			databaseURL: "host=db.internal user=api password=do-not-log " +
				"dbname=do_indeksa connect_timeout=-1",
			wantError: "DATABASE_URL is invalid",
		},
		{
			name:             "negative ambient connection timeout",
			databaseURL:      "postgresql://api:do-not-log@db.internal/do_indeksa",
			pgConnectTimeout: "-1",
			wantError:        "DATABASE_URL is invalid",
		},
		{
			name:        "excessive URL connection timeout",
			databaseURL: "postgresql://api:do-not-log@db.internal/do_indeksa?connect_timeout=31",
			wantError:   "DATABASE_URL connect_timeout must not exceed 30 seconds",
		},
		{
			name: "excessive keyword connection timeout",
			databaseURL: "host=db.internal user=api password=do-not-log " +
				"dbname=do_indeksa connect_timeout=31",
			wantError: "DATABASE_URL connect_timeout must not exceed 30 seconds",
		},
		{
			name:             "excessive ambient connection timeout",
			databaseURL:      "postgresql://api:do-not-log@db.internal/do_indeksa",
			pgConnectTimeout: "31",
			wantError:        "DATABASE_URL connect_timeout must not exceed 30 seconds",
		},
		{
			name:        "excessive URL pool maximum",
			databaseURL: "postgresql://api:do-not-log@db.internal/do_indeksa?pool_max_conns=51",
			wantError:   "DATABASE_URL pool_max_conns must not exceed 50",
		},
		{
			name: "excessive keyword pool maximum",
			databaseURL: "host=db.internal user=api password=do-not-log " +
				"dbname=do_indeksa pool_max_conns=51",
			wantError: "DATABASE_URL pool_max_conns must not exceed 50",
		},
		{
			name:        "invalid pool maximum without parser details",
			databaseURL: "postgresql://api:do-not-log@db.internal/do_indeksa?pool_max_conns=invalid",
			wantError:   "DATABASE_URL is invalid",
		},
		{
			name: "URL pool minimum above explicit maximum",
			databaseURL: "postgresql://api:do-not-log@db.internal/do_indeksa" +
				"?pool_max_conns=5&pool_min_conns=6",
			wantError: "DATABASE_URL pool_min_conns must be between 0 and pool_max_conns",
		},
		{
			name: "keyword pool minimum above default maximum",
			databaseURL: "host=db.internal user=api password=do-not-log " +
				"dbname=do_indeksa pool_min_conns=11",
			wantError: "DATABASE_URL pool_min_conns must be between 0 and pool_max_conns",
		},
		{
			name:        "negative pool minimum",
			databaseURL: "postgresql://api:do-not-log@db.internal/do_indeksa?pool_min_conns=-1",
			wantError:   "DATABASE_URL pool_min_conns must be between 0 and pool_max_conns",
		},
		{
			name: "URL idle pool minimum above explicit maximum",
			databaseURL: "postgresql://api:do-not-log@db.internal/do_indeksa" +
				"?pool_max_conns=5&pool_min_idle_conns=6",
			wantError: "DATABASE_URL pool_min_idle_conns must be between 0 and pool_max_conns",
		},
		{
			name: "keyword idle pool minimum above default maximum",
			databaseURL: "host=db.internal user=api password=do-not-log " +
				"dbname=do_indeksa pool_min_idle_conns=11",
			wantError: "DATABASE_URL pool_min_idle_conns must be between 0 and pool_max_conns",
		},
		{
			name:        "negative idle pool minimum",
			databaseURL: "postgresql://api:do-not-log@db.internal/do_indeksa?pool_min_idle_conns=-1",
			wantError:   "DATABASE_URL pool_min_idle_conns must be between 0 and pool_max_conns",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setValidRuntimeEnvironment(t)
			t.Setenv("DATABASE_URL", tt.databaseURL)
			t.Setenv("PGCONNECT_TIMEOUT", tt.pgConnectTimeout)

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

func TestDatabaseConfigBoundsConnectionPool(t *testing.T) {
	tests := []struct {
		name        string
		databaseURL string
		wantMax     int32
		wantMin     int32
		wantMinIdle int32
	}{
		{
			name:        "URL application default",
			databaseURL: "postgresql://api:password@db.internal/do_indeksa?sslmode=require",
			wantMax:     10,
		},
		{
			name:        "keyword application default",
			databaseURL: "host=db.internal user=api password=password dbname=do_indeksa sslmode=require",
			wantMax:     10,
		},
		{
			name: "explicit URL pool",
			databaseURL: "postgresql://api:password@db.internal/do_indeksa" +
				"?sslmode=require&pool_max_conns=7&pool_min_conns=2&pool_min_idle_conns=3",
			wantMax:     7,
			wantMin:     2,
			wantMinIdle: 3,
		},
		{
			name: "explicit keyword pool",
			databaseURL: "host=db.internal user=api password=password dbname=do_indeksa " +
				"sslmode=require pool_max_conns=6 pool_min_conns=1 pool_min_idle_conns=2",
			wantMax:     6,
			wantMin:     1,
			wantMinIdle: 2,
		},
		{
			name:        "lowest explicit maximum",
			databaseURL: "postgresql://api:password@db.internal/do_indeksa?pool_max_conns=1",
			wantMax:     1,
		},
		{
			name: "highest explicit pool",
			databaseURL: "host=db.internal user=api password=password dbname=do_indeksa " +
				"pool_max_conns=50 pool_min_conns=50 pool_min_idle_conns=50",
			wantMax:     50,
			wantMin:     50,
			wantMinIdle: 50,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("DATABASE_URL", tt.databaseURL)
			t.Setenv("PGCONNECT_TIMEOUT", "")

			cfg, err := databaseConfig()
			if err != nil {
				t.Fatalf("databaseConfig() error = %v", err)
			}
			if cfg.MaxConns != tt.wantMax || cfg.MinConns != tt.wantMin ||
				cfg.MinIdleConns != tt.wantMinIdle {
				t.Fatalf(
					"pool = max %d, min %d, min idle %d; want %d, %d, %d",
					cfg.MaxConns,
					cfg.MinConns,
					cfg.MinIdleConns,
					tt.wantMax,
					tt.wantMin,
					tt.wantMinIdle,
				)
			}
		})
	}
}

func TestDatabaseConfigBoundsConnectionAttempts(t *testing.T) {
	tests := []struct {
		name             string
		databaseURL      string
		pgConnectTimeout string
		wantTimeout      time.Duration
	}{
		{
			name:        "URL application default",
			databaseURL: "postgresql://api:password@db.internal/do_indeksa?sslmode=require",
			wantTimeout: 5 * time.Second,
		},
		{
			name:        "keyword application default",
			databaseURL: "host=db.internal user=api password=password dbname=do_indeksa sslmode=require",
			wantTimeout: 5 * time.Second,
		},
		{
			name:        "explicit zero uses application default",
			databaseURL: "postgresql://api:password@db.internal/do_indeksa?connect_timeout=0",
			wantTimeout: 5 * time.Second,
		},
		{
			name:        "positive URL timeout",
			databaseURL: "postgresql://api:password@db.internal/do_indeksa?connect_timeout=1",
			wantTimeout: time.Second,
		},
		{
			name:        "positive keyword timeout",
			databaseURL: "host=db.internal user=api password=password dbname=do_indeksa connect_timeout=9",
			wantTimeout: 9 * time.Second,
		},
		{
			name:        "maximum URL timeout",
			databaseURL: "postgresql://api:password@db.internal/do_indeksa?connect_timeout=30",
			wantTimeout: 30 * time.Second,
		},
		{
			name:             "bounded ambient timeout",
			databaseURL:      "postgresql://api:password@db.internal/do_indeksa",
			pgConnectTimeout: "7",
			wantTimeout:      7 * time.Second,
		},
		{
			name:             "connection string overrides ambient timeout",
			databaseURL:      "postgresql://api:password@db.internal/do_indeksa?connect_timeout=8",
			pgConnectTimeout: "31",
			wantTimeout:      8 * time.Second,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Setenv("DATABASE_URL", tt.databaseURL)
			t.Setenv("PGCONNECT_TIMEOUT", tt.pgConnectTimeout)

			cfg, err := databaseConfig()
			if err != nil {
				t.Fatalf("databaseConfig() error = %v", err)
			}
			if got := cfg.ConnConfig.ConnectTimeout; got != tt.wantTimeout {
				t.Fatalf("connect timeout = %v, want %v", got, tt.wantTimeout)
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
	t.Setenv("PGCONNECT_TIMEOUT", "")
}
