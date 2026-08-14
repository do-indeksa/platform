package progress

import (
	"crypto/sha256"
	"net/http"
	"testing"
	"time"

	"github.com/do-indeksa/platform/apps/api/internal/auth"
)

func TestLegacyAttemptsRefreshSlidingSessionCookie(t *testing.T) {
	app := newTestApp(t)
	session := seedSession(t, "-sliding-session")
	setLegacySessionExpiry(t, session, time.Now().Add(24*time.Hour))

	response := do(t, app, http.MethodGet, "/v1/attempts", nil, session)

	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	requireRefreshedLegacySessionCookie(t, response, session)
	if remaining := time.Until(legacySessionExpiry(t, session)); remaining < 29*24*time.Hour {
		t.Fatalf("database session was not extended: remaining=%v", remaining)
	}
}

func TestLegacyAttemptsDoNotRefreshFreshSession(t *testing.T) {
	app := newTestApp(t)
	session := seedSession(t, "-fresh-session")

	response := do(t, app, http.MethodGet, "/v1/attempts", nil, session)

	if response.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.StatusCode, http.StatusOK)
	}
	if cookies := response.Cookies(); len(cookies) != 0 {
		t.Fatalf("fresh session emitted cookies: %+v", cookies)
	}
}

func setLegacySessionExpiry(t *testing.T, session *http.Cookie, expiresAt time.Time) {
	t.Helper()
	tokenHash := sha256.Sum256([]byte(session.Value))
	result, err := testPool.Exec(
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

func legacySessionExpiry(t *testing.T, session *http.Cookie) time.Time {
	t.Helper()
	tokenHash := sha256.Sum256([]byte(session.Value))
	var expiresAt time.Time
	if err := testPool.QueryRow(
		t.Context(),
		"select expires_at from sessions where token_hash = $1",
		tokenHash[:],
	).Scan(&expiresAt); err != nil {
		t.Fatal(err)
	}
	return expiresAt
}

func requireRefreshedLegacySessionCookie(
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
