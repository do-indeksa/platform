package auth

import (
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/do-indeksa/platform/apps/api/internal/api"
	"github.com/do-indeksa/platform/apps/api/internal/httpx"
)

const maxAuthorizationCodeBytes = 4096

func (h *Handler) GoogleAuthCallback(
	w http.ResponseWriter,
	r *http.Request,
	params api.GoogleAuthCallbackParams,
) {
	disableAuthCaching(w)
	st, err := openState(h.service.cfg.Secret, params.State, time.Now())
	if err != nil || !h.validCallbackBinding(r, st.CallbackBinding) {
		h.invalidState(w)
		return
	}
	if !h.normalizeCallbackState(&st) {
		h.invalidState(w)
		return
	}
	h.service.clearOAuthBinding(w, h.service.cfg.CanonicalOrigin, st.CallbackBinding.ID)
	if params.Error != nil && *params.Error != "" {
		h.redirectCancelledAuth(w, r, st)
		return
	}
	if params.Code == nil || *params.Code == "" {
		httpx.WriteError(w, http.StatusBadRequest, "missing_code", "authorization code is missing")
		return
	}
	if len(*params.Code) > maxAuthorizationCodeBytes {
		httpx.WriteError(w, http.StatusBadRequest, "invalid_code", "authorization code was rejected")
		return
	}
	user, err := h.service.CompleteGoogleSignIn(r.Context(), *params.Code, st.Verifier)
	if h.writeGoogleError(w, err) {
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
	h.redirectWithHandoff(w, r, st, user)
}

func (h *Handler) validCallbackBinding(r *http.Request, binding oauthBinding) bool {
	origin, ok := h.service.allowedOrigin(requestOrigin(r))
	return ok && origin == h.service.cfg.CanonicalOrigin &&
		h.service.validateOAuthBinding(r, h.service.cfg.CanonicalOrigin, binding)
}

func (h *Handler) normalizeCallbackState(st *state) bool {
	origin, ok := h.service.allowedOrigin(st.Origin)
	if !ok || (origin == h.service.cfg.CanonicalOrigin) != (st.HandoffBinding == nil) {
		return false
	}
	if st.HandoffBinding != nil {
		if _, ok := decodeBindingHash(*st.HandoffBinding); !ok {
			return false
		}
	}
	redirect, ok := normalizeReturnPath(st.Redirect)
	if !ok {
		return false
	}
	st.Origin = origin
	st.Redirect = redirect
	return true
}

func (h *Handler) redirectCancelledAuth(
	w http.ResponseWriter,
	r *http.Request,
	st state,
) {
	if st.Origin == h.service.cfg.CanonicalOrigin {
		http.Redirect(w, r, st.Origin+st.Redirect, http.StatusFound)
		return
	}
	sealed, err := sealOAuthBootstrap(h.service.cfg.Secret, oauthBootstrap{
		Purpose:        bootstrapCancellationPurpose,
		Origin:         st.Origin,
		Redirect:       st.Redirect,
		HandoffBinding: *st.HandoffBinding,
		ExpiresAt:      time.Now().Add(bootstrapTTL).Unix(),
	})
	if err != nil {
		h.serverError(w, err, "failed to cancel sign-in")
		return
	}
	h.redirectToBootstrap(w, r, st.Origin, sealed)
}

func (h *Handler) writeGoogleError(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, ErrCodeRejected):
		httpx.WriteError(w, http.StatusBadRequest, "invalid_code", "authorization code was rejected")
	case errors.Is(err, ErrInvalidUserinfo):
		httpx.WriteError(w, http.StatusBadRequest, "userinfo_failed", "google profile is incomplete")
	case errors.Is(err, ErrProviderUnavailable):
		slog.Warn("sign-in provider unavailable", "error", err)
		httpx.WriteError(
			w,
			http.StatusBadGateway,
			"oauth_provider_unavailable",
			"sign-in provider is temporarily unavailable",
		)
	case err != nil:
		h.serverError(w, err, "failed to complete sign-in")
	default:
		return false
	}
	return true
}

func (h *Handler) redirectWithHandoff(
	w http.ResponseWriter,
	r *http.Request,
	st state,
	user User,
) {
	code, err := h.service.MintHandoffCode(
		r.Context(),
		user.ID,
		st.Origin,
		st.Redirect,
		*st.HandoffBinding,
	)
	if err != nil {
		h.serverError(w, err, "failed to create session")
		return
	}
	http.Redirect(
		w,
		r,
		st.Origin+"/api/v1/auth/exchange?code="+url.QueryEscape(code)+
			"&binding="+url.QueryEscape(st.HandoffBinding.ID),
		http.StatusFound,
	)
}

func (h *Handler) ExchangeAuthCode(
	w http.ResponseWriter,
	r *http.Request,
	params api.ExchangeAuthCodeParams,
) {
	disableAuthCaching(w)
	origin, bindingHash, ok := h.exchangeBinding(r, params.Binding)
	if !ok {
		h.invalidCode(w)
		return
	}
	exchange, err := h.service.ExchangeHandoffCode(
		r.Context(),
		params.Code,
		origin,
		params.Binding,
		bindingHash,
	)
	if errors.Is(err, pgx.ErrNoRows) || errors.Is(err, errInvalidReturnPath) {
		if errors.Is(err, errInvalidReturnPath) {
			h.service.clearOAuthBinding(w, origin, params.Binding)
		}
		h.invalidCode(w)
		return
	}
	if err != nil {
		h.serverError(w, err, "failed to create session")
		return
	}
	http.SetCookie(
		w,
		h.service.sessionCookie(exchange.SessionToken, int(sessionTTL.Seconds())),
	)
	h.service.clearOAuthBinding(w, origin, params.Binding)
	http.Redirect(w, r, exchange.Redirect, http.StatusFound)
}

func (h *Handler) exchangeBinding(
	r *http.Request,
	bindingID string,
) (string, []byte, bool) {
	origin, ok := h.service.allowedOrigin(requestOrigin(r))
	if !ok || origin == h.service.cfg.CanonicalOrigin {
		return "", nil, false
	}
	bindingHash, ok := h.service.requestOAuthBindingHash(r, origin, bindingID)
	return origin, bindingHash, ok
}

func (h *Handler) invalidState(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusBadRequest, "invalid_state", "sign-in state is invalid or expired")
}

func (h *Handler) invalidCode(w http.ResponseWriter) {
	httpx.WriteError(w, http.StatusBadRequest, "invalid_code", "code is invalid, expired or already used")
}

func disableAuthCaching(w http.ResponseWriter) {
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Pragma", "no-cache")
}
