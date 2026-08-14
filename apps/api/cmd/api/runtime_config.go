package main

import (
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/do-indeksa/platform/apps/api/internal/auth"
)

const defaultPort = "8080"

var (
	errDatabaseURLRequired = errors.New("DATABASE_URL is required")
	errDatabaseURLInvalid  = errors.New("DATABASE_URL is invalid")
	errPortInvalid         = errors.New("PORT must be a decimal number from 1 to 65535")
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
	cfg, err := pgxpool.ParseConfig(raw)
	if err != nil {
		return nil, errDatabaseURLInvalid
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
