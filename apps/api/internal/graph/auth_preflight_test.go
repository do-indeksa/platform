package graph

import (
	"bytes"
	"crypto/sha256"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/do-indeksa/platform/apps/api/internal/auth"
)

func TestGraphQLRejectsTransportAndProtocolInputBeforeSessionLookup(t *testing.T) {
	session := seedGraphTransportSession(t, "-preflight-session")
	setGraphSessionExpiry(t, session, time.Now().Add(24*time.Hour))
	tests := []struct {
		name        string
		body        string
		contentType string
		status      int
		code        string
	}{
		{
			name:        "unsupported media type",
			body:        `{"query":"query { runs { id } }"}`,
			contentType: "text/plain",
			status:      http.StatusUnsupportedMediaType,
			code:        "UNSUPPORTED_MEDIA_TYPE",
		},
		{
			name:        "invalid JSON",
			body:        `{"query":`,
			contentType: "application/json",
			status:      http.StatusBadRequest,
			code:        "BAD_REQUEST",
		},
		{
			name:        "oversized body",
			body:        strings.Repeat(" ", maxGraphQLBodyBytes+1),
			contentType: "application/json",
			status:      http.StatusRequestEntityTooLarge,
			code:        "PAYLOAD_TOO_LARGE",
		},
		{
			name:        "invalid GraphQL",
			body:        `{"query":"query {"}`,
			contentType: "application/json",
			status:      http.StatusUnprocessableEntity,
			code:        "GRAPHQL_PARSE_FAILED",
		},
		{
			name:        "multiple mutation commands",
			body:        `{"query":"mutation { first: abandonRun(input: {id: \"00000000-0000-0000-0000-000000000001\"}) { id } second: abandonRun(input: {id: \"00000000-0000-0000-0000-000000000002\"}) { id } }"}`,
			contentType: "application/json",
			status:      http.StatusUnprocessableEntity,
			code:        "GRAPHQL_VALIDATION_FAILED",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			before := graphTestPool.Stat().AcquireCount()
			request := graphTransportRequest(
				t,
				bytes.NewBufferString(tt.body),
				tt.contentType,
				session,
			)
			response := httptest.NewRecorder()

			graphApp.ServeHTTP(response, request)

			assertGraphTransportError(t, response.Result(), tt.status, tt.code)
			if cookies := response.Result().Cookies(); len(cookies) != 0 {
				t.Fatalf("preflight rejection refreshed session cookie: %+v", cookies)
			}
			if after := graphTestPool.Stat().AcquireCount(); after != before {
				t.Fatalf("pool acquire count changed from %d to %d", before, after)
			}
		})
	}
}

func TestGraphQLRefreshesSlidingSessionOnceForMultipleRootFields(t *testing.T) {
	session := seedGraphTransportSession(t, "-multi-root-session")
	setGraphSessionExpiry(t, session, time.Now().Add(24*time.Hour))
	before := graphTestPool.Stat().AcquireCount()

	response, payload := graphRequest(t, `query MultipleRootFields {
		runs(limit: 0) { id }
		attempts(limit: 0) { id }
	}`, nil, session)

	if len(payload.Errors) != 2 {
		t.Fatalf("errors = %+v, want two BAD_USER_INPUT errors", payload.Errors)
	}
	for _, graphError := range payload.Errors {
		if graphError.Extensions["code"] != "BAD_USER_INPUT" {
			t.Fatalf("unexpected GraphQL error: %+v", graphError)
		}
	}
	requireRefreshedGraphSessionCookie(t, response, session)
	if after := graphTestPool.Stat().AcquireCount(); after != before+2 {
		t.Fatalf("pool acquire count = %d, want %d", after, before+2)
	}
	if remaining := time.Until(graphSessionExpiry(t, session)); remaining < 29*24*time.Hour {
		t.Fatalf("database session was not extended: remaining=%v", remaining)
	}
}

func TestGraphQLDoesNotRefreshFreshSession(t *testing.T) {
	session := seedGraphTransportSession(t, "-fresh-session")
	before := graphTestPool.Stat().AcquireCount()

	response, payload := graphRequest(t, `query { prepPreferences { version } }`, nil, session)

	requireGraphSuccess(t, payload)
	if cookies := response.Cookies(); len(cookies) != 0 {
		t.Fatalf("fresh session emitted cookies: %+v", cookies)
	}
	if after := graphTestPool.Stat().AcquireCount(); after != before+2 {
		t.Fatalf("pool acquire count = %d, want %d", after, before+2)
	}
}

func TestGraphQLRejectsMalformedSessionBeforeDatabaseLookup(t *testing.T) {
	session := &http.Cookie{
		Name:  auth.SessionCookieName,
		Value: "invalid-session-token",
	}
	before := graphTestPool.Stat().AcquireCount()

	response, payload := graphRequest(t, `query { prepPreferences { version } }`, nil, session)

	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	requireGraphCode(t, payload, "UNAUTHENTICATED")
	if cookies := response.Cookies(); len(cookies) != 0 {
		t.Fatalf("malformed session emitted cookies: %+v", cookies)
	}
	if after := graphTestPool.Stat().AcquireCount(); after != before {
		t.Fatalf("pool acquire count changed from %d to %d", before, after)
	}
}

func setGraphSessionExpiry(t *testing.T, session *http.Cookie, expiresAt time.Time) {
	t.Helper()
	tokenHash := sha256.Sum256([]byte(session.Value))
	result, err := graphTestPool.Exec(
		t.Context(),
		"update sessions set expires_at = $1 where token_hash = $2",
		expiresAt,
		tokenHash[:],
	)
	if err != nil {
		t.Fatal(err)
	}
	if result.RowsAffected() != 1 {
		t.Fatalf("updated %d sessions, want 1", result.RowsAffected())
	}
}

func graphSessionExpiry(t *testing.T, session *http.Cookie) time.Time {
	t.Helper()
	tokenHash := sha256.Sum256([]byte(session.Value))
	var expiresAt time.Time
	if err := graphTestPool.QueryRow(
		t.Context(),
		"select expires_at from sessions where token_hash = $1",
		tokenHash[:],
	).Scan(&expiresAt); err != nil {
		t.Fatal(err)
	}
	return expiresAt
}

func requireRefreshedGraphSessionCookie(
	t *testing.T,
	response *http.Response,
	session *http.Cookie,
) {
	t.Helper()
	cookies := response.Cookies()
	if len(cookies) != 1 {
		t.Fatalf("response cookies = %+v, want one refreshed session", cookies)
	}
	refreshed := cookies[0]
	if refreshed.Name != auth.SessionCookieName || refreshed.Value != session.Value ||
		refreshed.Path != "/" || refreshed.Domain != "" ||
		refreshed.MaxAge != int((30*24*time.Hour).Seconds()) ||
		!refreshed.HttpOnly || !refreshed.Secure ||
		refreshed.SameSite != http.SameSiteLaxMode {
		t.Fatalf("unexpected refreshed session cookie: %+v", refreshed)
	}
}
