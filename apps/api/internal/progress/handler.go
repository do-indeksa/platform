package progress

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"

	"github.com/do-indeksa/platform/apps/api/internal/api"
	"github.com/do-indeksa/platform/apps/api/internal/auth"
	"github.com/do-indeksa/platform/apps/api/internal/httpx"
)

const maxBatchSize = 500

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
			TaskId:  row.TaskID,
			Slot:    int(row.Slot),
			Correct: row.Correct,
			Source:  api.AttemptSource(row.Source),
			At:      row.CreatedAt,
		}
	}
	httpx.WriteJSON(w, http.StatusOK, attempts)
}

func (h *Handler) RecordAttempts(w http.ResponseWriter, r *http.Request) {
	user, ok := h.requestUser(w, r)
	if !ok {
		return
	}
	var body []api.NewAttempt
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_body", "body must be a json array of attempts")
		return
	}
	if len(body) == 0 || len(body) > maxBatchSize {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_batch", "batch must hold between 1 and 500 attempts")
		return
	}
	params := make([]InsertAttemptsParams, len(body))
	for i, attempt := range body {
		if attempt.TaskId == "" || attempt.Slot < 1 || attempt.Slot > 10 || !attempt.Source.Valid() {
			httpx.WriteError(w, http.StatusBadRequest, "invalid_attempt", "attempt fields are out of range")
			return
		}
		params[i] = InsertAttemptsParams{
			TaskID:  attempt.TaskId,
			Slot:    int32(attempt.Slot),
			Correct: attempt.Correct,
			Source:  string(attempt.Source),
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

func (h *Handler) requestUser(w http.ResponseWriter, r *http.Request) (auth.User, bool) {
	user, err := h.auth.RequestUser(r)
	if errors.Is(err, auth.ErrNoSession) {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized", "no valid session")
		return auth.User{}, false
	}
	if err != nil {
		h.serverError(w, err, "failed to load session")
		return auth.User{}, false
	}
	return user, true
}

func (h *Handler) serverError(w http.ResponseWriter, err error, message string) {
	slog.Error(message, "error", err)
	httpx.WriteError(w, http.StatusInternalServerError, "internal", message)
}
