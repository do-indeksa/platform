package auth

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
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
		writeError(w, http.StatusInternalServerError, "internal", "failed to start sign-in")
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
	token, err := h.service.oauth().Exchange(ctx, params.Code, oauth2.VerifierOption(st.Verifier))
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid_code", "authorization code was rejected")
		return
	}
	info, err := h.service.fetchUserinfo(ctx, token)
	if err != nil {
		writeError(w, http.StatusBadRequest, "userinfo_failed", "could not fetch google profile")
		return
	}
	var picture *string
	if info.Picture != "" {
		picture = &info.Picture
	}
	user, err := h.service.queries.UpsertUser(ctx, UpsertUserParams{
		GoogleSub:  info.Sub,
		Email:      info.Email,
		Name:       cmp.Or(info.Name, info.Email),
		PictureUrl: picture,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "failed to save user")
		return
	}
	if st.Origin == h.service.cfg.CanonicalOrigin {
		if err := h.issueSession(ctx, w, user.ID); err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "failed to create session")
			return
		}
		http.Redirect(w, r, st.Redirect, http.StatusFound)
		return
	}
	code, codeHash, err := newSecret()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "failed to create session")
		return
	}
	err = h.service.queries.CreateAuthCode(ctx, CreateAuthCodeParams{
		CodeHash:  codeHash,
		UserID:    user.ID,
		Redirect:  st.Redirect,
		ExpiresAt: time.Now().Add(codeTTL),
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "failed to create session")
		return
	}
	http.Redirect(w, r, st.Origin+"/api/v1/auth/exchange?code="+url.QueryEscape(code), http.StatusFound)
}

func (h *Handler) ExchangeAuthCode(w http.ResponseWriter, r *http.Request, params api.ExchangeAuthCodeParams) {
	ctx := r.Context()
	row, err := h.service.queries.ConsumeAuthCode(ctx, hashSecret(params.Code))
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusBadRequest, "invalid_code", "code is invalid, expired or already used")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "failed to create session")
		return
	}
	if err := h.issueSession(ctx, w, row.UserID); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "failed to create session")
		return
	}
	http.Redirect(w, r, row.Redirect, http.StatusFound)
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		_ = h.service.queries.DeleteSession(r.Context(), hashSecret(cookie.Value))
	}
	http.SetCookie(w, h.service.sessionCookie("", -1))
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) GetMe(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "no valid session")
		return
	}
	tokenHash := hashSecret(cookie.Value)
	row, err := h.service.queries.GetSessionUser(ctx, tokenHash)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "no valid session")
		return
	}
	if time.Until(row.ExpiresAt) < sessionTTL/2 {
		_ = h.service.queries.ExtendSession(ctx, ExtendSessionParams{
			TokenHash: tokenHash,
			ExpiresAt: time.Now().Add(sessionTTL),
		})
	}
	writeJSON(w, http.StatusOK, api.User{
		Id:         row.User.ID,
		Email:      types.Email(row.User.Email),
		Name:       row.User.Name,
		PictureUrl: row.User.PictureUrl,
	})
}

func (h *Handler) issueSession(ctx context.Context, w http.ResponseWriter, userID uuid.UUID) error {
	token, tokenHash, err := newSecret()
	if err != nil {
		return err
	}
	err = h.service.queries.CreateSession(ctx, CreateSessionParams{
		TokenHash: tokenHash,
		UserID:    userID,
		ExpiresAt: time.Now().Add(sessionTTL),
	})
	if err != nil {
		return err
	}
	http.SetCookie(w, h.service.sessionCookie(token, int(sessionTTL.Seconds())))
	return nil
}

func requestOrigin(r *http.Request) string {
	host := cmp.Or(r.Header.Get("X-Forwarded-Host"), r.Host)
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
