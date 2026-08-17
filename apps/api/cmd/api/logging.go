package main

import (
	"io"
	"log/slog"
)

func newApplicationLogger(output io.Writer) *slog.Logger {
	return slog.New(slog.NewJSONHandler(output, nil))
}
