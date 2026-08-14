package auth

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

type authCodeFixture struct {
	codeHash           []byte
	userID             uuid.UUID
	origin             *string
	redirect           string
	browserBindingID   *string
	browserBindingHash []byte
	expiresAt          time.Time
}

func insertSessionFixture(
	t *testing.T,
	tokenHash []byte,
	userID uuid.UUID,
	expiresAt time.Time,
) {
	t.Helper()
	if _, err := testPool.Exec(t.Context(), `
		insert into sessions (token_hash, user_id, expires_at)
		values ($1, $2, $3)
	`, tokenHash, userID, expiresAt); err != nil {
		t.Fatal(err)
	}
}

func insertAuthCodeFixture(t *testing.T, fixture authCodeFixture) {
	t.Helper()
	if _, err := testPool.Exec(t.Context(), `
		insert into auth_codes (
			code_hash,
			user_id,
			origin,
			redirect,
			browser_binding_id,
			browser_binding_hash,
			expires_at
		)
		values ($1, $2, $3, $4, $5, $6, $7)
	`,
		fixture.codeHash,
		fixture.userID,
		fixture.origin,
		fixture.redirect,
		fixture.browserBindingID,
		fixture.browserBindingHash,
		fixture.expiresAt,
	); err != nil {
		t.Fatal(err)
	}
}

func databaseClock(t *testing.T) time.Time {
	t.Helper()
	var now time.Time
	if err := testPool.QueryRow(t.Context(), "select clock_timestamp()").Scan(&now); err != nil {
		t.Fatal(err)
	}
	return now
}

func assertExpiryWithin(
	t *testing.T,
	name string,
	expiresAt time.Time,
	before, after time.Time,
	ttl time.Duration,
) {
	t.Helper()
	if expiresAt.Before(before.Add(ttl)) || expiresAt.After(after.Add(ttl)) {
		t.Fatalf(
			"%s expiry %v is outside database bounds [%v, %v]",
			name,
			expiresAt,
			before.Add(ttl),
			after.Add(ttl),
		)
	}
}

func storedSessionExpiry(t *testing.T, tokenHash []byte) time.Time {
	t.Helper()
	var expiresAt time.Time
	if err := testPool.QueryRow(
		t.Context(),
		"select expires_at from sessions where token_hash = $1",
		tokenHash,
	).Scan(&expiresAt); err != nil {
		t.Fatal(err)
	}
	return expiresAt
}

func storedAuthCodeExpiry(t *testing.T, codeHash []byte) time.Time {
	t.Helper()
	var expiresAt time.Time
	if err := testPool.QueryRow(
		t.Context(),
		"select expires_at from auth_codes where code_hash = $1",
		codeHash,
	).Scan(&expiresAt); err != nil {
		t.Fatal(err)
	}
	return expiresAt
}
