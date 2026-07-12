package auth

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/oapi-codegen/runtime/types"
	"golang.org/x/oauth2"

	"github.com/do-indeksa/platform/apps/api/internal/api"
)

type Handler struct {
	service *Service
}

var _ api.ServerInterface = (*Handler)(nil)

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func ParamErrorHandler(w http.ResponseWriter, _ *http.Request, err error) {
	writeError(w, http.StatusBadRequest, "invalid_request", err.Error())
}

func (h *Handler) StartGoogleAuth(w http.ResponseWriter, r *http.Request, params api.StartGoogleAuthParams) {
	origin := requestOrigin(r)
	if !h.service.originAllowed(origin) {
		writeError(w, http.StatusBadRequest, "origin_not_allowed", "sign-in must start from a known origin")
		return
	}
	verifier := oauth2.GenerateVerifier()
	sealed, err := sealState(h.service.cfg.Secret, state{
		Origin:    origin,
		Redirect:  sanitizeRedirect(params.Redirect),
		Verifier:  verifier,
		ExpiresAt: time.Now().Add(stateTTL).Unix(),
	})
	if err != nil {
		h.serverError(w, err, "failed to start sign-in")
		return
	}
	authURL := h.service.oauth().AuthCodeURL(sealed, oauth2.S256ChallengeOption(verifier))
	http.Redirect(w, r, authURL, http.StatusFound)
}

func (h *Handler) GoogleAuthCallback(w http.ResponseWriter, r *http.Request, params api.GoogleAuthCallbackParams) {
	ctx := r.Context()
	st, err := openState(h.service.cfg.Secret, params.State, time.Now())
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_state", "sign-in state is invalid or expired")
		return
	}
	if params.Error != nil && *params.Error != "" {
		http.Redirect(w, r, st.Origin+st.Redirect, http.StatusFound)
		return
	}
	if params.Code == nil || *params.Code == "" {
		writeError(w, http.StatusBadRequest, "missing_code", "authorization code is missing")
		return
	}
	user, err := h.service.CompleteGoogleSignIn(ctx, *params.Code, st.Verifier)
	switch {
	case errors.Is(err, ErrCodeRejected):
		writeError(w, http.StatusBadRequest, "invalid_code", "authorization code was rejected")
		return
	case errors.Is(err, ErrInvalidUserinfo):
		writeError(w, http.StatusBadRequest, "userinfo_failed", "google profile is incomplete")
		return
	case err != nil:
		h.serverError(w, err, "failed to complete sign-in")
		return
	}
	if st.Origin == h.service.cfg.CanonicalOrigin {
		if err := h.setSessionCookie(w, r, user); err != nil {
			h.serverError(w, err, "failed to create session")
			return
		}
		http.Redirect(w, r, st.Redirect, http.StatusFound)
		return
	}
	code, err := h.service.MintHandoffCode(ctx, user.ID, st.Redirect)
	if err != nil {
		h.serverError(w, err, "failed to create session")
		return
	}
	http.Redirect(w, r, st.Origin+"/api/v1/auth/exchange?code="+url.QueryEscape(code), http.StatusFound)
}

func (h *Handler) ExchangeAuthCode(w http.ResponseWriter, r *http.Request, params api.ExchangeAuthCodeParams) {
	row, err := h.service.ExchangeHandoffCode(r.Context(), params.Code)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusBadRequest, "invalid_code", "code is invalid, expired or already used")
		return
	}
	if err != nil {
		h.serverError(w, err, "failed to create session")
		return
	}
	if err := h.setSessionCookie(w, r, User{ID: row.UserID}); err != nil {
		h.serverError(w, err, "failed to create session")
		return
	}
	http.Redirect(w, r, row.Redirect, http.StatusFound)
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		if err := h.service.Logout(r.Context(), cookie.Value); err != nil {
			slog.Warn("logout session delete failed", "error", err)
		}
	}
	http.SetCookie(w, h.service.sessionCookie("", -1))
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) GetMe(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "no valid session")
		return
	}
	user, refreshed, err := h.service.SessionUser(r.Context(), cookie.Value)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusUnauthorized, "unauthorized", "no valid session")
		return
	}
	if err != nil {
		h.serverError(w, err, "failed to load session")
		return
	}
	if refreshed {
		http.SetCookie(w, h.service.sessionCookie(cookie.Value, int(sessionTTL.Seconds())))
	}
	writeJSON(w, http.StatusOK, api.User{
		Id:         user.ID,
		Email:      types.Email(user.Email),
		Name:       user.Name,
		PictureUrl: user.PictureUrl,
	})
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
	writeError(w, http.StatusInternalServerError, "internal", message)
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
	if proto == "" {
		proto = "https"
		if host == "localhost" || strings.HasPrefix(host, "localhost:") {
			proto = "http"
		}
	}
	return proto + "://" + host
}

func sanitizeRedirect(redirect *string) string {
	if redirect == nil || !strings.HasPrefix(*redirect, "/") || strings.HasPrefix(*redirect, "//") {
		return "/"
	}
	return *redirect
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, api.Error{Code: code, Message: message})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
