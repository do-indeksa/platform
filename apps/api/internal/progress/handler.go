package progress

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"mime"
	"net/http"

	"github.com/do-indeksa/platform/apps/api/internal/api"
	"github.com/do-indeksa/platform/apps/api/internal/auth"
	"github.com/do-indeksa/platform/apps/api/internal/httpx"
	"github.com/do-indeksa/platform/apps/api/internal/safelog"
)

const (
	maxBatchSize = 500
	maxBodyBytes = 256 << 10
)

type Handler struct {
	auth    *auth.Service
	service *Service
}

func NewHandler(authService *auth.Service, service *Service) *Handler {
	return &Handler{auth: authService, service: service}
}

func (h *Handler) ListAttempts(w http.ResponseWriter, r *http.Request) {
	user, ok := h.requestUser(w, r)
	if !ok {
		return
	}
	rows, err := h.service.List(r.Context(), user.ID)
	if err != nil {
		h.serverError(w, err, "failed to load attempts")
		return
	}
	attempts := make([]api.Attempt, len(rows))
	for i, row := range rows {
		attempts[i] = api.Attempt{
			TaskId:    row.TaskID,
			Slot:      int(row.Slot),
			Correct:   row.Correct,
			Source:    api.AttemptSource(row.Source),
			HelpLevel: int(row.HelpLevel),
			At:        row.CreatedAt,
		}
	}
	httpx.WriteJSON(w, http.StatusOK, attempts)
}

func (h *Handler) RecordAttempts(w http.ResponseWriter, r *http.Request) {
	user, ok := h.requestUser(w, r)
	if !ok {
		return
	}
	mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
	if err != nil || mediaType != "application/json" {
		httpx.WriteError(
			w,
			http.StatusUnsupportedMediaType,
			"unsupported_media_type",
			"content type must be application/json",
		)
		return
	}
	if r.ContentLength > maxBodyBytes {
		writeAttemptBodyTooLarge(w)
		return
	}
	var body []api.NewAttempt
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	decoder := json.NewDecoder(r.Body)
	if err := decoder.Decode(&body); err != nil {
		writeAttemptBodyError(w, err)
		return
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		writeAttemptBodyError(w, err)
		return
	}
	if body == nil {
		writeAttemptBodyError(w, nil)
		return
	}
	if len(body) == 0 || len(body) > maxBatchSize {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_batch", "batch must hold between 1 and 500 attempts")
		return
	}
	params := make([]InsertAttemptsParams, len(body))
	for i, attempt := range body {
		if !validTaskID(attempt.TaskId) || attempt.Slot < 1 || attempt.Slot > 10 || !attempt.Source.Valid() {
			httpx.WriteError(w, http.StatusBadRequest, "invalid_attempt", "attempt fields are out of range")
			return
		}
		params[i] = InsertAttemptsParams{
			TaskID:  attempt.TaskId,
			Slot:    int32(attempt.Slot),
			Correct: attempt.Correct,
			Source:  string(attempt.Source),
		}
		if attempt.HelpLevel != nil {
			if *attempt.HelpLevel < 0 || *attempt.HelpLevel > 3 {
				httpx.WriteError(w, http.StatusBadRequest, "invalid_attempt", "attempt fields are out of range")
				return
			}
			params[i].HelpLevel = int16(*attempt.HelpLevel)
		}
		if attempt.At != nil {
			params[i].CreatedAt = *attempt.At
		}
	}
	if err := h.service.Record(r.Context(), user.ID, params); err != nil {
		h.serverError(w, err, "failed to record attempts")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeAttemptBodyError(w http.ResponseWriter, err error) {
	var maxBytesError *http.MaxBytesError
	if errors.As(err, &maxBytesError) {
		writeAttemptBodyTooLarge(w)
		return
	}
	httpx.WriteError(
		w,
		http.StatusBadRequest,
		"invalid_body",
		"body must contain one json array of attempts",
	)
}

func writeAttemptBodyTooLarge(w http.ResponseWriter) {
	httpx.WriteError(
		w,
		http.StatusRequestEntityTooLarge,
		"request_too_large",
		"request body exceeds 256 KiB",
	)
}

func (h *Handler) requestUser(w http.ResponseWriter, r *http.Request) (auth.User, bool) {
	user, refreshedCookie, err := h.auth.RequestUser(r)
	if errors.Is(err, auth.ErrNoSession) {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized", "no valid session")
		return auth.User{}, false
	}
	if err != nil {
		h.serverError(w, err, "failed to load session")
		return auth.User{}, false
	}
	if refreshedCookie != nil {
		http.SetCookie(w, refreshedCookie)
	}
	return user, true
}

func (h *Handler) serverError(w http.ResponseWriter, err error, message string) {
	slog.Error(message, safelog.Error(err))
	httpx.WriteError(w, http.StatusInternalServerError, "internal", message)
}
