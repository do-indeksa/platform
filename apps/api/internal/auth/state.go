package auth

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"time"
)

var errInvalidState = errors.New("invalid state")

const (
	maxOAuthTokenLength = 4096
	stateKeyPurpose     = "do-indeksa/oauth-state/browser-bound/v1"
	oauthClockSkew      = 30 * time.Second
)

type state struct {
	Origin          string        `json:"origin"`
	Redirect        string        `json:"redirect"`
	Verifier        string        `json:"verifier"`
	CallbackBinding oauthBinding  `json:"callback_binding"`
	HandoffBinding  *oauthBinding `json:"handoff_binding,omitempty"`
	ExpiresAt       int64         `json:"exp"`
}

func sealState(key []byte, st state) (string, error) {
	return sealOAuthToken(deriveOAuthKey(key, stateKeyPurpose), st)
}

func openState(key []byte, token string, now time.Time) (state, error) {
	var st state
	if err := openOAuthToken(deriveOAuthKey(key, stateKeyPurpose), token, &st); err != nil {
		return state{}, err
	}
	if now.Add(-oauthClockSkew).Unix() >= st.ExpiresAt ||
		st.ExpiresAt > now.Add(stateTTL+oauthClockSkew).Unix() {
		return state{}, errInvalidState
	}
	return st, nil
}

func deriveOAuthKey(secret []byte, purpose string) []byte {
	mac := hmac.New(sha256.New, secret)
	_, _ = mac.Write([]byte(purpose))
	return mac.Sum(nil)
}

func sealOAuthToken(key []byte, payload any) (string, error) {
	plaintext, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	gcm, err := newGCM(key)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	sealed := gcm.Seal(nonce, nonce, plaintext, nil)
	token := base64.RawURLEncoding.EncodeToString(sealed)
	if len(token) > maxOAuthTokenLength {
		return "", errInvalidState
	}
	return token, nil
}

func openOAuthToken(key []byte, token string, payload any) error {
	if token == "" || len(token) > maxOAuthTokenLength {
		return errInvalidState
	}
	sealed, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil || base64.RawURLEncoding.EncodeToString(sealed) != token {
		return errInvalidState
	}
	gcm, err := newGCM(key)
	if err != nil {
		return err
	}
	if len(sealed) < gcm.NonceSize() {
		return errInvalidState
	}
	plaintext, err := gcm.Open(nil, sealed[:gcm.NonceSize()], sealed[gcm.NonceSize():], nil)
	if err != nil {
		return errInvalidState
	}
	decoder := json.NewDecoder(bytes.NewReader(plaintext))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(payload); err != nil {
		return errInvalidState
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errInvalidState
	}
	return nil
}

func newGCM(key []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
