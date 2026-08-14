package auth

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/oapi-codegen/runtime/types"

	"github.com/do-indeksa/platform/apps/api/internal/api"
	"github.com/do-indeksa/platform/apps/api/internal/httpx"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func ParamErrorHandler(w http.ResponseWriter, _ *http.Request, err error) {
	httpx.WriteError(w, http.StatusBadRequest, "invalid_request", err.Error())
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := h.service.requestSessionCookie(r); err == nil {
		if err := h.service.Logout(r.Context(), cookie.Value); err != nil {
			slog.Warn("logout session delete failed", "error", err)
		}
	}
	http.SetCookie(w, h.service.sessionCookie("", -1))
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) GetMe(w http.ResponseWriter, r *http.Request) {
	user, refreshedCookie, err := h.service.RequestUser(r)
	if errors.Is(err, ErrNoSession) {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized", "no valid session")
		return
	}
	if err != nil {
		h.serverError(w, err, "failed to load session")
		return
	}
	if refreshedCookie != nil {
		http.SetCookie(w, refreshedCookie)
	}
	httpx.WriteJSON(w, http.StatusOK, api.User{
		Id:         user.ID,
		Email:      types.Email(user.Email),
		Name:       user.Name,
		PictureUrl: user.PictureUrl,
	})
}

func (h *Handler) DeleteAccount(w http.ResponseWriter, r *http.Request) {
	cookie, err := h.service.requestSessionCookie(r)
	if err != nil {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized", "no valid session")
		return
	}
	deleted, err := h.service.DeleteAccount(r.Context(), cookie.Value)
	if err != nil {
		h.serverError(w, err, "failed to delete account")
		return
	}
	if !deleted {
		httpx.WriteError(w, http.StatusUnauthorized, "unauthorized", "no valid session")
		return
	}
	http.SetCookie(w, h.service.sessionCookie("", -1))
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) setSessionCookie(w http.ResponseWriter, r *http.Request, user User) error {
	token, err := h.service.IssueSession(r.Context(), user.ID)
	if err != nil {
		return err
	}
	http.SetCookie(w, h.service.sessionCookie(token, int(sessionTTL.Seconds())))
	return nil
}

func (h *Handler) serverError(w http.ResponseWriter, err error, message string) {
	slog.Error(message, "error", err)
	httpx.WriteError(w, http.StatusInternalServerError, "internal", message)
}

func requestOrigin(r *http.Request) string {
	if origin := r.Header.Get("X-Di-Forwarded-Origin"); origin != "" {
		return origin
	}
	host := r.Header.Get("X-Forwarded-Host")
	if host != "" {
		host, _, _ = strings.Cut(host, ",")
		host = strings.TrimSpace(host)
	} else {
		host = r.Host
	}
	proto := r.Header.Get("X-Forwarded-Proto")
	proto, _, _ = strings.Cut(proto, ",")
	proto = strings.TrimSpace(proto)
	if proto == "" {
		proto = "https"
		if origin, ok := parseOrigin("http://" + host); ok && loopbackOrigin(origin) {
			proto = "http"
		}
	}
	return proto + "://" + host
}
