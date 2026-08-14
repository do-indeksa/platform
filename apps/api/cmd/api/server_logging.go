package main

import (
	"errors"
	"log"
	"log/slog"

	"github.com/do-indeksa/platform/apps/api/internal/safelog"
)

var errHTTPServer = errors.New("http server error")

func newHTTPServerErrorLog(logger *slog.Logger) *log.Logger {
	return log.New(httpServerErrorWriter{logger: logger}, "", 0)
}

type httpServerErrorWriter struct {
	logger *slog.Logger
}

func (writer httpServerErrorWriter) Write(message []byte) (int, error) {
	writer.logger.Error("http server error", safelog.Error(errHTTPServer))
	return len(message), nil
}
