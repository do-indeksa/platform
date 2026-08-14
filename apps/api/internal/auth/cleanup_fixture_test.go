package auth

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

type cleanupFixture struct {
	user          User
	sessionHashes [][]byte
}

func seedCleanupRows(t *testing.T, sessionExpiries, authCodeExpiries []time.Time) cleanupFixture {
	t.Helper()
	ctx := t.Context()
	queries := New(testPool)
	key := uuid.NewString()
	user, err := queries.UpsertUser(ctx, UpsertUserParams{
		GoogleSub: "cleanup-" + key,
		Email:     key + "@example.com",
		Name:      "Cleanup fixture",
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), "delete from users where id = $1", user.ID)
	})

	fixture := cleanupFixture{user: user, sessionHashes: make([][]byte, 0, len(sessionExpiries))}
	for _, expiresAt := range sessionExpiries {
		_, tokenHash, err := newSecret()
		if err != nil {
			t.Fatal(err)
		}
		if err := queries.CreateSession(ctx, CreateSessionParams{
			TokenHash: tokenHash,
			UserID:    user.ID,
			ExpiresAt: expiresAt,
		}); err != nil {
			t.Fatal(err)
		}
		fixture.sessionHashes = append(fixture.sessionHashes, tokenHash)
	}
	for _, expiresAt := range authCodeExpiries {
		code, _, err := newSecret()
		if err != nil {
			t.Fatal(err)
		}
		if err := queries.CreateAuthCode(ctx, CreateAuthCodeParams{
			CodeHash:  hashHandoffCode(code),
			UserID:    user.ID,
			Redirect:  "/",
			ExpiresAt: expiresAt,
		}); err != nil {
			t.Fatal(err)
		}
	}
	return fixture
}

func repeatedExpiry(value time.Time, count int) []time.Time {
	values := make([]time.Time, count)
	for index := range values {
		values[index] = value
	}
	return values
}

func expiredCleanupFixtureTime() time.Time {
	return time.Date(2000, time.January, 1, 0, 0, 0, 0, time.UTC)
}

type cleanupCounts struct {
	expiredSessions  int64
	liveSessions     int64
	expiredAuthCodes int64
	liveAuthCodes    int64
}

func assertCleanupCounts(t *testing.T, userID uuid.UUID, want cleanupCounts) {
	t.Helper()
	var got cleanupCounts
	if err := testPool.QueryRow(t.Context(), `
		select count(*) filter (where expires_at <= now()),
		       count(*) filter (where expires_at > now())
		from sessions
		where user_id = $1
	`, userID).Scan(&got.expiredSessions, &got.liveSessions); err != nil {
		t.Fatal(err)
	}
	if err := testPool.QueryRow(t.Context(), `
		select count(*) filter (where expires_at <= now()),
		       count(*) filter (where expires_at > now())
		from auth_codes
		where user_id = $1
	`, userID).Scan(&got.expiredAuthCodes, &got.liveAuthCodes); err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Fatalf("cleanup row counts = %+v, want %+v", got, want)
	}
}
