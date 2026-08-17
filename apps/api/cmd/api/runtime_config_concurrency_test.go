package main

import (
	"strings"
	"testing"
)

func TestLoadRuntimeConfigConfiguresInFlightRequestLimit(t *testing.T) {
	for _, tt := range []struct {
		name  string
		value string
		want  int
	}{
		{name: "default", want: 64},
		{name: "lowest", value: "1", want: 1},
		{name: "highest", value: "256", want: 256},
	} {
		t.Run(tt.name, func(t *testing.T) {
			setValidRuntimeEnvironment(t)
			t.Setenv("MAX_IN_FLIGHT_REQUESTS", tt.value)

			cfg, err := loadRuntimeConfig()
			if err != nil {
				t.Fatalf("loadRuntimeConfig() error = %v", err)
			}
			if cfg.maxInFlightRequests != tt.want {
				t.Errorf("max in-flight requests = %d, want %d", cfg.maxInFlightRequests, tt.want)
			}
		})
	}
}

func TestLoadRuntimeConfigRejectsInvalidMaxInFlightRequests(t *testing.T) {
	for _, value := range []string{
		"0",
		"-1",
		"+64",
		" 64",
		"64 ",
		"257",
		"1.5",
		"do-not-log",
		"999999999999999999999999999999999999999",
	} {
		t.Run(value, func(t *testing.T) {
			setValidRuntimeEnvironment(t)
			t.Setenv("MAX_IN_FLIGHT_REQUESTS", value)

			_, err := loadRuntimeConfig()
			const want = "MAX_IN_FLIGHT_REQUESTS must be a decimal number from 1 to 256"
			if err == nil || err.Error() != want {
				t.Fatalf("loadRuntimeConfig() error = %v, want %q", err, want)
			}
			if strings.Contains(err.Error(), value) {
				t.Errorf("configuration error disclosed invalid concurrency value %q", value)
			}
		})
	}
}
