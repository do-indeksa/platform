package auth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"errors"
	"time"
)

var errInvalidState = errors.New("invalid state")

type state struct {
	Origin    string `json:"origin"`
	Redirect  string `json:"redirect"`
	Verifier  string `json:"verifier"`
	ExpiresAt int64  `json:"exp"`
}

func sealState(key []byte, st state) (string, error) {
	plaintext, err := json.Marshal(st)
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
	return base64.RawURLEncoding.EncodeToString(sealed), nil
}

func openState(key []byte, token string, now time.Time) (state, error) {
	sealed, err := base64.RawURLEncoding.DecodeString(token)
	if err != nil {
		return state{}, errInvalidState
	}
	gcm, err := newGCM(key)
	if err != nil {
		return state{}, err
	}
	if len(sealed) < gcm.NonceSize() {
		return state{}, errInvalidState
	}
	plaintext, err := gcm.Open(nil, sealed[:gcm.NonceSize()], sealed[gcm.NonceSize():], nil)
	if err != nil {
		return state{}, errInvalidState
	}
	var st state
	if err := json.Unmarshal(plaintext, &st); err != nil {
		return state{}, errInvalidState
	}
	if now.Unix() > st.ExpiresAt {
		return state{}, errInvalidState
	}
	return st, nil
}

func newGCM(key []byte) (cipher.AEAD, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	return cipher.NewGCM(block)
}
