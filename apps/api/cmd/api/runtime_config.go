package main

import (
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/do-indeksa/platform/apps/api/internal/auth"
)

const (
	defaultPort                   = "8080"
	defaultDatabaseConnectTimeout = 5 * time.Second
	maxDatabaseConnectTimeout     = 30 * time.Second
	defaultDatabasePoolMaxConns   = int32(10)
	maxDatabasePoolMaxConns       = int32(50)
)

var (
	errDatabaseURLRequired           = errors.New("DATABASE_URL is required")
	errDatabaseURLInvalid            = errors.New("DATABASE_URL is invalid")
	errDatabaseConnectTimeoutInvalid = errors.New(
		"DATABASE_URL connect_timeout must not exceed 30 seconds",
	)
	errDatabasePoolMaxConnsInvalid = errors.New(
		"DATABASE_URL pool_max_conns must not exceed 50",
	)
	errDatabasePoolMinConnsInvalid = errors.New(
		"DATABASE_URL pool_min_conns must be between 0 and pool_max_conns",
	)
	errDatabasePoolMinIdleConnsInvalid = errors.New(
		"DATABASE_URL pool_min_idle_conns must be between 0 and pool_max_conns",
	)
	errPortInvalid = errors.New("PORT must be a decimal number from 1 to 65535")
)

type runtimeConfig struct {
	auth          auth.Config
	database      *pgxpool.Config
	listenAddress string
}

func loadRuntimeConfig() (runtimeConfig, error) {
	authCfg, err := authConfig()
	if err != nil {
		return runtimeConfig{}, err
	}
	databaseCfg, err := databaseConfig()
	if err != nil {
		return runtimeConfig{}, err
	}
	address, err := listenAddress()
	if err != nil {
		return runtimeConfig{}, err
	}
	return runtimeConfig{
		auth:          authCfg,
		database:      databaseCfg,
		listenAddress: address,
	}, nil
}

func authConfig() (auth.Config, error) {
	secret, err := hex.DecodeString(os.Getenv("AUTH_SECRET"))
	if err != nil || len(secret) != 32 {
		return auth.Config{}, errors.New("AUTH_SECRET must be 64 hex characters")
	}
	cfg := auth.Config{
		ClientID:            os.Getenv("GOOGLE_CLIENT_ID"),
		ClientSecret:        os.Getenv("GOOGLE_CLIENT_SECRET"),
		Secret:              secret,
		CanonicalOrigin:     os.Getenv("CANONICAL_WEB_ORIGIN"),
		PreviewOriginSuffix: os.Getenv("PREVIEW_ORIGIN_SUFFIX"),
	}
	if rawOrigins := os.Getenv("EXTRA_WEB_ORIGINS"); rawOrigins != "" {
		for origin := range strings.SplitSeq(rawOrigins, ",") {
			cfg.ExtraOrigins = append(cfg.ExtraOrigins, origin)
		}
	}
	for _, required := range [...]struct {
		name  string
		value string
	}{
		{name: "GOOGLE_CLIENT_ID", value: cfg.ClientID},
		{name: "GOOGLE_CLIENT_SECRET", value: cfg.ClientSecret},
		{name: "CANONICAL_WEB_ORIGIN", value: cfg.CanonicalOrigin},
	} {
		if required.value == "" {
			return auth.Config{}, fmt.Errorf("%s is required", required.name)
		}
	}
	if err := auth.ValidateConfig(cfg); err != nil {
		return auth.Config{}, err
	}
	return cfg, nil
}

func databaseConfig() (*pgxpool.Config, error) {
	raw := os.Getenv("DATABASE_URL")
	if strings.TrimSpace(raw) == "" {
		return nil, errDatabaseURLRequired
	}
	// Pgxpool consumes pool parameters while parsing, so inspect a separate
	// connection config to distinguish an explicit maximum from its CPU default.
	parsed, err := pgx.ParseConfig(raw)
	if err != nil {
		return nil, errDatabaseURLInvalid
	}
	_, explicitPoolMaximum := parsed.RuntimeParams["pool_max_conns"]
	cfg, err := pgxpool.ParseConfig(raw)
	if err != nil {
		return nil, errDatabaseURLInvalid
	}
	if cfg.ConnConfig.ConnectTimeout < 0 {
		return nil, errDatabaseURLInvalid
	}
	if cfg.ConnConfig.ConnectTimeout == 0 {
		cfg.ConnConfig.ConnectTimeout = defaultDatabaseConnectTimeout
	}
	if cfg.ConnConfig.ConnectTimeout > maxDatabaseConnectTimeout {
		return nil, errDatabaseConnectTimeoutInvalid
	}
	if !explicitPoolMaximum {
		cfg.MaxConns = defaultDatabasePoolMaxConns
	}
	if cfg.MaxConns > maxDatabasePoolMaxConns {
		return nil, errDatabasePoolMaxConnsInvalid
	}
	if cfg.MinConns < 0 || cfg.MinConns > cfg.MaxConns {
		return nil, errDatabasePoolMinConnsInvalid
	}
	if cfg.MinIdleConns < 0 || cfg.MinIdleConns > cfg.MaxConns {
		return nil, errDatabasePoolMinIdleConnsInvalid
	}
	return cfg, nil
}

func listenAddress() (string, error) {
	raw := os.Getenv("PORT")
	if raw == "" {
		raw = defaultPort
	}
	for _, character := range raw {
		if character < '0' || character > '9' {
			return "", errPortInvalid
		}
	}
	port, err := strconv.ParseUint(raw, 10, 16)
	if err != nil || port == 0 {
		return "", errPortInvalid
	}
	return ":" + strconv.FormatUint(port, 10), nil
}
