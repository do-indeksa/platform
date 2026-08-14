package auth

import (
	"context"
	"testing"
	"time"
)

func TestPersistedAuthExpiryUsesDatabaseClock(t *testing.T) {
	user := seedUser(t)
	queries := New(testPool)
	_, sessionHash, err := newSecret()
	if err != nil {
		t.Fatal(err)
	}
	code, _, err := newSecret()
	if err != nil {
		t.Fatal(err)
	}

	before := databaseClock(t)
	if err := queries.CreateSession(t.Context(), CreateSessionParams{
		TokenHash:  sessionHash,
		UserID:     user.ID,
		TtlSeconds: sessionTTLSeconds,
	}); err != nil {
		t.Fatal(err)
	}
	if err := queries.CreateAuthCode(t.Context(), CreateAuthCodeParams{
		CodeHash:   hashHandoffCode(code),
		UserID:     user.ID,
		Redirect:   "/",
		TtlSeconds: codeTTLSeconds,
	}); err != nil {
		t.Fatal(err)
	}
	after := databaseClock(t)

	assertExpiryWithin(
		t,
		"session",
		storedSessionExpiry(t, sessionHash),
		before,
		after,
		sessionTTL,
	)
	assertExpiryWithin(
		t,
		"auth code",
		storedAuthCodeExpiry(t, hashHandoffCode(code)),
		before,
		after,
		codeTTL,
	)
}

func TestSessionRefreshDueUsesDatabaseClock(t *testing.T) {
	user := seedUser(t)
	_, tokenHash, err := newSecret()
	if err != nil {
		t.Fatal(err)
	}
	databaseNow := databaseClock(t)
	insertSessionFixture(t, tokenHash, user.ID, databaseNow.Add(sessionTTL/2-time.Minute))

	queries := New(testPool)
	params := GetSessionUserParams{
		RefreshWindowSeconds: sessionRefreshWindowSeconds,
		TokenHash:            tokenHash,
	}
	row, err := queries.GetSessionUser(t.Context(), params)
	if err != nil {
		t.Fatal(err)
	}
	if !row.RefreshDue {
		t.Fatal("session inside the database half-life window was not due for refresh")
	}

	if _, err := testPool.Exec(
		t.Context(),
		"update sessions set expires_at = $1 where token_hash = $2",
		databaseNow.Add(sessionTTL/2+time.Minute),
		tokenHash,
	); err != nil {
		t.Fatal(err)
	}
	row, err = queries.GetSessionUser(t.Context(), params)
	if err != nil {
		t.Fatal(err)
	}
	if row.RefreshDue {
		t.Fatal("session outside the database half-life window was due for refresh")
	}
}

func TestSessionExtensionIsMonotonicAcrossOutOfOrderTransactions(t *testing.T) {
	user := seedUser(t)
	_, tokenHash, err := newSecret()
	if err != nil {
		t.Fatal(err)
	}
	insertSessionFixture(t, tokenHash, user.ID, databaseClock(t).Add(time.Hour))

	older, err := testPool.Begin(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = older.Rollback(context.Background()) }()
	var olderClock time.Time
	if err := older.QueryRow(t.Context(), "select now()").Scan(&olderClock); err != nil {
		t.Fatal(err)
	}
	for !databaseClock(t).After(olderClock) {
		time.Sleep(time.Millisecond)
	}

	params := ExtendSessionParams{
		TtlSeconds: sessionTTLSeconds,
		TokenHash:  tokenHash,
	}
	if updated, err := New(testPool).ExtendSession(t.Context(), params); err != nil || updated != 1 {
		t.Fatalf("newer extension = (%d, %v), want (1, nil)", updated, err)
	}
	newerExpiry := storedSessionExpiry(t, tokenHash)
	if updated, err := New(older).ExtendSession(t.Context(), params); err != nil || updated != 1 {
		t.Fatalf("older extension = (%d, %v), want (1, nil)", updated, err)
	}
	if err := older.Commit(t.Context()); err != nil {
		t.Fatal(err)
	}

	if finalExpiry := storedSessionExpiry(t, tokenHash); !finalExpiry.Equal(newerExpiry) {
		t.Fatalf("session expiry moved from %v to %v", newerExpiry, finalExpiry)
	}
}
