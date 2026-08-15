package auth

import (
	"bytes"
	"encoding/base64"
	"strconv"
	"testing"
	"time"
)

var testKey = bytes.Repeat([]byte{7}, 32)

func TestStateRoundtrip(t *testing.T) {
	now := time.Now()
	binding := oauthBinding{
		ID:   "AAAAAAAAAAAAAAAAAAAAAA",
		Hash: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
	}
	sealed, err := sealState(testKey, state{
		Origin:          "https://doindeksa.rs",
		Redirect:        "/prep",
		Verifier:        "v",
		CallbackBinding: binding,
		ExpiresAt:       now.Add(time.Minute).Unix(),
	})
	if err != nil {
		t.Fatal(err)
	}
	st, err := openState(testKey, sealed, now)
	if err != nil {
		t.Fatal(err)
	}
	if st.Origin != "https://doindeksa.rs" || st.Redirect != "/prep" || st.Verifier != "v" ||
		st.CallbackBinding != binding {
		t.Fatalf("unexpected payload: %+v", st)
	}
}

func TestStateRejected(t *testing.T) {
	now := time.Now()
	valid, err := sealState(testKey, state{ExpiresAt: now.Add(time.Minute).Unix()})
	if err != nil {
		t.Fatal(err)
	}
	withinPastSkew, err := sealState(testKey, state{
		ExpiresAt: now.Add(-oauthClockSkew + time.Second).Unix(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := openState(testKey, withinPastSkew, now); err != nil {
		t.Fatalf("state within past clock skew rejected: %v", err)
	}
	expired, err := sealState(testKey, state{
		ExpiresAt: now.Add(-oauthClockSkew - time.Second).Unix(),
	})
	if err != nil {
		t.Fatal(err)
	}
	withinSkew, err := sealState(testKey, state{
		ExpiresAt: now.Add(stateTTL + oauthClockSkew).Unix(),
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := openState(testKey, withinSkew, now); err != nil {
		t.Fatalf("state within clock skew rejected: %v", err)
	}
	tooFar, err := sealState(testKey, state{
		ExpiresAt: now.Add(stateTTL + oauthClockSkew + time.Second).Unix(),
	})
	if err != nil {
		t.Fatal(err)
	}
	otherKey := bytes.Repeat([]byte{8}, 32)

	tests := []struct {
		name  string
		key   []byte
		token string
	}{
		{"not base64", testKey, "%%%"},
		{"tampered", testKey, valid[:len(valid)-2] + "xx"},
		{"wrong key", otherKey, valid},
		{"expired", testKey, expired},
		{"too far", testKey, tooFar},
		{"oversized", testKey, string(bytes.Repeat([]byte{'a'}, maxOAuthTokenLength+1))},
		{"too short", testKey, "aaaa"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if _, err := openState(tt.key, tt.token, now); err == nil {
				t.Fatal("expected error")
			}
		})
	}
}

func TestOAuthTokenRejectsUnknownAndTrailingJSON(t *testing.T) {
	now := time.Now()
	expiry := strconv.FormatInt(now.Add(time.Minute).Unix(), 10)
	for _, plaintext := range []string{
		`{"exp":` + expiry + `,"unknown":true}`,
		`{"exp":` + expiry + `}{}`,
	} {
		t.Run(plaintext, func(t *testing.T) {
			token := sealRawOAuthToken(t, plaintext)
			if _, err := openState(testKey, token, now); err == nil {
				t.Fatal("expected strict JSON rejection")
			}
		})
	}
}

func TestBrowserBoundStateUsesVersionedEncryptionKey(t *testing.T) {
	now := time.Now()
	legacy, err := sealOAuthToken(testKey, state{ExpiresAt: now.Add(time.Minute).Unix()})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := openState(testKey, legacy, now); err == nil {
		t.Fatal("browser-bound reader accepted legacy state key")
	}
	current, err := sealState(testKey, state{ExpiresAt: now.Add(time.Minute).Unix()})
	if err != nil {
		t.Fatal(err)
	}
	var decoded state
	if err := openOAuthToken(testKey, current, &decoded); err == nil {
		t.Fatal("legacy reader accepted browser-bound state key")
	}
}

func sealRawOAuthToken(t *testing.T, plaintext string) string {
	t.Helper()
	gcm, err := newGCM(deriveOAuthKey(testKey, stateKeyPurpose))
	if err != nil {
		t.Fatal(err)
	}
	nonce := bytes.Repeat([]byte{9}, gcm.NonceSize())
	return base64.RawURLEncoding.EncodeToString(gcm.Seal(nonce, nonce, []byte(plaintext), nil))
}
