package auth

import (
	"bytes"
	"testing"
	"time"
)

var testKey = bytes.Repeat([]byte{7}, 32)

func TestStateRoundtrip(t *testing.T) {
	now := time.Now()
	sealed, err := sealState(testKey, state{
		Origin:    "https://doindeksa.rs",
		Redirect:  "/prep",
		Verifier:  "v",
		ExpiresAt: now.Add(time.Minute).Unix(),
	})
	if err != nil {
		t.Fatal(err)
	}
	st, err := openState(testKey, sealed, now)
	if err != nil {
		t.Fatal(err)
	}
	if st.Origin != "https://doindeksa.rs" || st.Redirect != "/prep" || st.Verifier != "v" {
		t.Fatalf("unexpected payload: %+v", st)
	}
}

func TestStateRejected(t *testing.T) {
	now := time.Now()
	valid, err := sealState(testKey, state{ExpiresAt: now.Add(time.Minute).Unix()})
	if err != nil {
		t.Fatal(err)
	}
	expired, err := sealState(testKey, state{ExpiresAt: now.Add(-time.Second).Unix()})
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
