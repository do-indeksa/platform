package auth

import (
	"net/http"
	"net/url"
	"time"

	"golang.org/x/oauth2"

	"github.com/do-indeksa/platform/apps/api/internal/api"
	"github.com/do-indeksa/platform/apps/api/internal/httpx"
)

func (h *Handler) StartGoogleAuth(
	w http.ResponseWriter,
	r *http.Request,
	params api.StartGoogleAuthParams,
) {
	disableAuthCaching(w)
	origin, ok := h.service.allowedOrigin(requestOrigin(r))
	if !ok {
		httpx.WriteError(
			w,
			http.StatusBadRequest,
			"origin_not_allowed",
			"sign-in must start from a known origin",
		)
		return
	}
	redirect := sanitizeReturnPath(params.Redirect)
	if origin != h.service.cfg.CanonicalOrigin {
		h.redirectPreviewStart(w, r, origin, redirect)
		return
	}
	h.redirectToGoogle(w, r, origin, redirect, nil, nil)
}

func (h *Handler) redirectPreviewStart(
	w http.ResponseWriter,
	r *http.Request,
	origin string,
	redirect string,
) {
	handoffBinding, err := h.service.newOAuthBinding(w, origin)
	if err != nil {
		h.serverError(w, err, "failed to start sign-in")
		return
	}
	sealed, err := sealOAuthBootstrap(h.service.cfg.Secret, oauthBootstrap{
		Purpose:        bootstrapInitialPurpose,
		Origin:         origin,
		Redirect:       redirect,
		HandoffBinding: handoffBinding,
		ExpiresAt:      time.Now().Add(bootstrapTTL).Unix(),
	})
	if err != nil {
		h.serverError(w, err, "failed to start sign-in")
		return
	}
	h.redirectToBootstrap(w, r, h.service.cfg.CanonicalOrigin, sealed)
}

func (h *Handler) BootstrapGoogleAuth(
	w http.ResponseWriter,
	r *http.Request,
	params api.BootstrapGoogleAuthParams,
) {
	disableAuthCaching(w)
	bootstrap, err := openOAuthBootstrap(h.service.cfg.Secret, params.Request, time.Now())
	if err != nil {
		h.invalidState(w)
		return
	}
	if !h.normalizeBootstrap(&bootstrap) {
		h.invalidState(w)
		return
	}
	origin, ok := h.service.allowedOrigin(requestOrigin(r))
	if !ok {
		h.invalidState(w)
		return
	}
	switch bootstrap.Purpose {
	case bootstrapInitialPurpose:
		h.confirmPreviewBrowser(w, r, bootstrap, origin)
	case bootstrapConfirmationPurpose:
		h.continueFromPreview(w, r, bootstrap, origin)
	case bootstrapContinuationPurpose:
		h.finishPreviewBootstrap(w, r, bootstrap, origin)
	case bootstrapCancellationPurpose:
		h.finishPreviewCancellation(w, r, bootstrap, origin)
	default:
		h.invalidState(w)
	}
}

func (h *Handler) finishPreviewCancellation(
	w http.ResponseWriter,
	r *http.Request,
	bootstrap oauthBootstrap,
	origin string,
) {
	if origin != bootstrap.Origin ||
		!h.service.validateOAuthBinding(r, bootstrap.Origin, bootstrap.HandoffBinding) {
		h.invalidState(w)
		return
	}
	h.service.clearOAuthBinding(w, bootstrap.Origin, bootstrap.HandoffBinding.ID)
	http.Redirect(w, r, bootstrap.Redirect, http.StatusFound)
}

func (h *Handler) normalizeBootstrap(bootstrap *oauthBootstrap) bool {
	origin, ok := h.service.allowedOrigin(bootstrap.Origin)
	if !ok || origin == h.service.cfg.CanonicalOrigin {
		return false
	}
	redirect, ok := normalizeReturnPath(bootstrap.Redirect)
	if !ok {
		return false
	}
	bootstrap.Origin = origin
	bootstrap.Redirect = redirect
	return true
}

func (h *Handler) confirmPreviewBrowser(
	w http.ResponseWriter,
	r *http.Request,
	bootstrap oauthBootstrap,
	origin string,
) {
	if origin != h.service.cfg.CanonicalOrigin {
		h.invalidState(w)
		return
	}
	callbackBinding, err := h.service.newOAuthBinding(w, h.service.cfg.CanonicalOrigin)
	if err != nil {
		h.serverError(w, err, "failed to start sign-in")
		return
	}
	bootstrap.Purpose = bootstrapConfirmationPurpose
	bootstrap.CallbackBinding = &callbackBinding
	h.redirectSealedBootstrap(w, r, bootstrap.Origin, bootstrap)
}

func (h *Handler) continueFromPreview(
	w http.ResponseWriter,
	r *http.Request,
	bootstrap oauthBootstrap,
	origin string,
) {
	if origin != bootstrap.Origin ||
		!h.service.validateOAuthBinding(r, bootstrap.Origin, bootstrap.HandoffBinding) {
		h.invalidState(w)
		return
	}
	bootstrap.Purpose = bootstrapContinuationPurpose
	h.redirectSealedBootstrap(w, r, h.service.cfg.CanonicalOrigin, bootstrap)
}

func (h *Handler) finishPreviewBootstrap(
	w http.ResponseWriter,
	r *http.Request,
	bootstrap oauthBootstrap,
	origin string,
) {
	if origin != h.service.cfg.CanonicalOrigin || bootstrap.CallbackBinding == nil ||
		!h.service.validateOAuthBinding(r, h.service.cfg.CanonicalOrigin, *bootstrap.CallbackBinding) {
		h.invalidState(w)
		return
	}
	h.redirectToGoogle(
		w,
		r,
		bootstrap.Origin,
		bootstrap.Redirect,
		&bootstrap.HandoffBinding,
		bootstrap.CallbackBinding,
	)
}

func (h *Handler) redirectSealedBootstrap(
	w http.ResponseWriter,
	r *http.Request,
	origin string,
	bootstrap oauthBootstrap,
) {
	bootstrap.ExpiresAt = time.Now().Add(bootstrapTTL).Unix()
	sealed, err := sealOAuthBootstrap(h.service.cfg.Secret, bootstrap)
	if err != nil {
		h.serverError(w, err, "failed to start sign-in")
		return
	}
	h.redirectToBootstrap(w, r, origin, sealed)
}

func (h *Handler) redirectToGoogle(
	w http.ResponseWriter,
	r *http.Request,
	origin string,
	redirect string,
	handoffBinding *oauthBinding,
	boundCallback *oauthBinding,
) {
	callbackBinding, err := h.callbackBinding(w, boundCallback)
	if err != nil {
		h.serverError(w, err, "failed to start sign-in")
		return
	}
	verifier := oauth2.GenerateVerifier()
	sealed, err := sealState(h.service.cfg.Secret, state{
		Origin:          origin,
		Redirect:        redirect,
		Verifier:        verifier,
		CallbackBinding: callbackBinding,
		HandoffBinding:  handoffBinding,
		ExpiresAt:       time.Now().Add(stateTTL).Unix(),
	})
	if err != nil {
		h.serverError(w, err, "failed to start sign-in")
		return
	}
	authURL := h.service.oauth().AuthCodeURL(sealed, oauth2.S256ChallengeOption(verifier))
	http.Redirect(w, r, authURL, http.StatusFound)
}

func (h *Handler) callbackBinding(
	w http.ResponseWriter,
	bound *oauthBinding,
) (oauthBinding, error) {
	if bound != nil {
		return *bound, nil
	}
	return h.service.newOAuthBinding(w, h.service.cfg.CanonicalOrigin)
}

func (h *Handler) redirectToBootstrap(
	w http.ResponseWriter,
	r *http.Request,
	origin string,
	request string,
) {
	http.Redirect(
		w,
		r,
		origin+bootstrapPath+"?request="+url.QueryEscape(request),
		http.StatusFound,
	)
}
