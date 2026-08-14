package auth

import (
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

func TestSessionExtensionDoesNotReviveExpiredRow(t *testing.T) {
	expiredAt := time.Now().Add(-time.Hour)
	session := seedSession(t, expiredAt)

	updated, err := New(testPool).ExtendSession(t.Context(), ExtendSessionParams{
		TokenHash: hashSecret(session.Value),
		ExpiresAt: time.Now().Add(sessionTTL),
	})
	if err != nil {
		t.Fatal(err)
	}
	if updated != 0 {
		t.Fatalf("updated %d expired sessions, want 0", updated)
	}

	var storedExpiry time.Time
	if err := testPool.QueryRow(
		t.Context(),
		"select expires_at from sessions where token_hash = $1",
		hashSecret(session.Value),
	).Scan(&storedExpiry); err != nil {
		t.Fatal(err)
	}
	if !storedExpiry.Before(time.Now()) {
		t.Fatalf("expired session was revived until %v", storedExpiry)
	}
}

func TestMalformedSessionTokensDoNotReachPersistence(t *testing.T) {
	service := NewService(testPool, Config{})
	validToken, _, err := newSecret()
	if err != nil {
		t.Fatal(err)
	}
	malformed := []struct {
		name  string
		token string
	}{
		{name: "empty", token: ""},
		{name: "short", token: validToken[:len(validToken)-1]},
		{name: "long", token: validToken + "A"},
		{name: "padded", token: validToken + "="},
		{name: "invalid alphabet", token: strings.Repeat("A", len(validToken)-1) + "+"},
		{name: "non-canonical encoding", token: strings.Repeat("A", len(validToken)-1) + "B"},
	}

	for _, tt := range malformed {
		t.Run(tt.name, func(t *testing.T) {
			before := testPool.Stat().AcquireCount()
			if _, _, err := service.SessionUser(t.Context(), tt.token); !errors.Is(err, pgx.ErrNoRows) {
				t.Fatalf("SessionUser error = %v, want pgx.ErrNoRows", err)
			}
			if err := service.Logout(t.Context(), tt.token); err != nil {
				t.Fatalf("Logout error = %v, want nil", err)
			}
			deleted, err := service.DeleteAccount(t.Context(), tt.token)
			if err != nil || deleted {
				t.Fatalf("DeleteAccount = (%v, %v), want (false, nil)", deleted, err)
			}
			if after := testPool.Stat().AcquireCount(); after != before {
				t.Fatalf("pool acquire count changed from %d to %d", before, after)
			}
		})
	}
}

func TestWellFormedUnknownSessionTokensReachPersistence(t *testing.T) {
	service := NewService(testPool, Config{})
	token, _, err := newSecret()
	if err != nil {
		t.Fatal(err)
	}
	tests := []struct {
		name string
		call func() error
	}{
		{
			name: "lookup",
			call: func() error {
				_, _, err := service.SessionUser(t.Context(), token)
				return err
			},
		},
		{
			name: "logout",
			call: func() error {
				return service.Logout(t.Context(), token)
			},
		},
		{
			name: "account deletion",
			call: func() error {
				_, err := service.DeleteAccount(t.Context(), token)
				return err
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			before := testPool.Stat().AcquireCount()
			err := tt.call()
			if tt.name == "lookup" {
				if !errors.Is(err, pgx.ErrNoRows) {
					t.Fatalf("error = %v, want pgx.ErrNoRows", err)
				}
			} else if err != nil {
				t.Fatalf("error = %v, want nil", err)
			}
			if after := testPool.Stat().AcquireCount(); after != before+1 {
				t.Fatalf("pool acquire count = %d, want %d", after, before+1)
			}
		})
	}
}

func TestAuthEndpointsRejectMalformedSessionBeforeDatabaseLookup(t *testing.T) {
	app := newTestApp(t, newFakeGoogle(t, userinfo{}))
	session := &http.Cookie{
		Name:  localSessionCookieName,
		Value: "invalid-session-token",
	}
	tests := []struct {
		name       string
		method     string
		target     string
		wantStatus int
	}{
		{
			name:       "current user",
			method:     http.MethodGet,
			target:     "/v1/me",
			wantStatus: http.StatusUnauthorized,
		},
		{
			name:       "logout",
			method:     http.MethodPost,
			target:     "/v1/auth/logout",
			wantStatus: http.StatusNoContent,
		},
		{
			name:       "account deletion",
			method:     http.MethodDelete,
			target:     "/v1/me",
			wantStatus: http.StatusUnauthorized,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			before := testPool.Stat().AcquireCount()
			response := do(t, app, tt.method, tt.target, "localhost:3000", session)

			if response.StatusCode != tt.wantStatus {
				t.Fatalf("status = %d, want %d", response.StatusCode, tt.wantStatus)
			}
			if after := testPool.Stat().AcquireCount(); after != before {
				t.Fatalf("pool acquire count changed from %d to %d", before, after)
			}
			if tt.method == http.MethodPost {
				cleared := sessionFromResponse(t, response)
				if cleared.Value != "" || cleared.MaxAge >= 0 {
					t.Fatalf("logout did not clear the malformed cookie: %+v", cleared)
				}
				return
			}
			if body := resBody(t, response); body != "{\"code\":\"unauthorized\",\"message\":\"no valid session\"}\n" {
				t.Fatalf("unexpected rejection body: %q", body)
			}
		})
	}
}
