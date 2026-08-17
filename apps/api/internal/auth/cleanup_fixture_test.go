package auth

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
)

type cleanupFixture struct {
	user           User
	sessionHashes  [][]byte
	authCodeHashes [][]byte
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

	fixture := cleanupFixture{
		user:           user,
		sessionHashes:  make([][]byte, 0, len(sessionExpiries)),
		authCodeHashes: make([][]byte, 0, len(authCodeExpiries)),
	}
	for _, expiresAt := range sessionExpiries {
		_, tokenHash, err := newSecret()
		if err != nil {
			t.Fatal(err)
		}
		insertSessionFixture(t, tokenHash, user.ID, expiresAt)
		fixture.sessionHashes = append(fixture.sessionHashes, tokenHash)
	}
	for _, expiresAt := range authCodeExpiries {
		code, _, err := newSecret()
		if err != nil {
			t.Fatal(err)
		}
		codeHash := hashHandoffCode(code)
		insertAuthCodeFixture(t, authCodeFixture{
			codeHash:  codeHash,
			userID:    user.ID,
			redirect:  "/",
			expiresAt: expiresAt,
		})
		fixture.authCodeHashes = append(fixture.authCodeHashes, codeHash)
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

func assertSessionHashExists(t *testing.T, hash []byte, want bool) {
	t.Helper()
	assertCleanupHashExists(t, "select exists(select 1 from sessions where token_hash = $1)", hash, want)
}

func assertAuthCodeHashExists(t *testing.T, hash []byte, want bool) {
	t.Helper()
	assertCleanupHashExists(t, "select exists(select 1 from auth_codes where code_hash = $1)", hash, want)
}

func assertCleanupHashExists(t *testing.T, query string, hash []byte, want bool) {
	t.Helper()
	var exists bool
	if err := testPool.QueryRow(t.Context(), query, hash).Scan(&exists); err != nil {
		t.Fatal(err)
	}
	if exists != want {
		t.Fatalf("cleanup row exists = %t, want %t", exists, want)
	}
}
