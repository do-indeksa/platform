package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"net/http"
	"time"
)

const (
	oauthBindingIDBytes       = 16
	oauthBindingSecretBytes   = 32
	oauthBindingCookiePrefix  = "di_oauth_"
	secureBindingCookiePrefix = "__Host-di_oauth_"
	oauthBindingTTL           = 4*bootstrapTTL + stateTTL + codeTTL + oauthClockSkew
)

type oauthBinding struct {
	ID   string `json:"id"`
	Hash string `json:"hash"`
}

func (s *Service) newOAuthBinding(
	w http.ResponseWriter,
	origin string,
) (oauthBinding, error) {
	id, err := randomToken(oauthBindingIDBytes)
	if err != nil {
		return oauthBinding{}, err
	}
	secret, err := randomToken(oauthBindingSecretBytes)
	if err != nil {
		return oauthBinding{}, err
	}
	hash := hashSecret(secret)
	http.SetCookie(w, s.oauthBindingCookie(origin, id, secret, int(oauthBindingTTL.Seconds())))
	return oauthBinding{ID: id, Hash: base64.RawURLEncoding.EncodeToString(hash)}, nil
}

func (s *Service) validateOAuthBinding(
	r *http.Request,
	origin string,
	binding oauthBinding,
) bool {
	expected, ok := decodeBindingHash(binding)
	if !ok {
		return false
	}
	actual, ok := s.requestOAuthBindingHash(r, origin, binding.ID)
	return ok && subtle.ConstantTimeCompare(actual, expected) == 1
}

func (s *Service) requestOAuthBindingHash(
	r *http.Request,
	origin string,
	bindingID string,
) ([]byte, bool) {
	if !validBindingID(bindingID) {
		return nil, false
	}
	cookie, err := r.Cookie(s.oauthBindingCookieName(origin, bindingID))
	if err != nil {
		return nil, false
	}
	if len(cookie.Value) != base64.RawURLEncoding.EncodedLen(oauthBindingSecretBytes) {
		return nil, false
	}
	secret, err := base64.RawURLEncoding.DecodeString(cookie.Value)
	if err != nil || len(secret) != oauthBindingSecretBytes ||
		base64.RawURLEncoding.EncodeToString(secret) != cookie.Value {
		return nil, false
	}
	return hashSecret(cookie.Value), true
}

func (s *Service) clearOAuthBinding(w http.ResponseWriter, origin, bindingID string) {
	if !validBindingID(bindingID) {
		return
	}
	http.SetCookie(w, s.oauthBindingCookie(origin, bindingID, "", -1))
}

func (s *Service) oauthBindingCookie(
	origin string,
	bindingID string,
	value string,
	maxAge int,
) *http.Cookie {
	cookie := &http.Cookie{
		Name:     s.oauthBindingCookieName(origin, bindingID),
		Value:    value,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   secureOrigin(origin),
		SameSite: http.SameSiteLaxMode,
	}
	if maxAge > 0 {
		cookie.Expires = time.Now().Add(time.Duration(maxAge) * time.Second)
	} else if maxAge < 0 {
		cookie.Expires = time.Unix(1, 0)
	}
	return cookie
}

func (s *Service) oauthBindingCookieName(origin, bindingID string) string {
	prefix := oauthBindingCookiePrefix
	if secureOrigin(origin) {
		prefix = secureBindingCookiePrefix
	}
	return prefix + bindingID
}

func decodeBindingHash(binding oauthBinding) ([]byte, bool) {
	if !validBindingID(binding.ID) {
		return nil, false
	}
	if len(binding.Hash) != base64.RawURLEncoding.EncodedLen(sha256.Size) {
		return nil, false
	}
	hash, err := base64.RawURLEncoding.DecodeString(binding.Hash)
	if err != nil || len(hash) != sha256.Size ||
		base64.RawURLEncoding.EncodeToString(hash) != binding.Hash {
		return nil, false
	}
	return hash, true
}

func validBindingID(value string) bool {
	if len(value) != base64.RawURLEncoding.EncodedLen(oauthBindingIDBytes) {
		return false
	}
	raw, err := base64.RawURLEncoding.DecodeString(value)
	return err == nil && len(raw) == oauthBindingIDBytes &&
		base64.RawURLEncoding.EncodeToString(raw) == value
}

func randomToken(size int) (string, error) {
	raw := make([]byte, size)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(raw), nil
}

func secureOrigin(raw string) bool {
	origin, ok := parseOrigin(raw)
	return ok && origin.scheme == "https"
}
