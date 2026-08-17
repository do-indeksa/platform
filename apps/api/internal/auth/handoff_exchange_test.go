package auth

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestSessionInsertFailureRollsBackHandoffConsumption(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool, Config{
		CanonicalOrigin:     testCanonical,
		PreviewOriginSuffix: "-scope.vercel.app",
	})
	user := seedHandoffUser(t)
	code, _, err := newSecret()
	if err != nil {
		t.Fatal(err)
	}
	binding, _ := newTestOAuthBinding(t, testPreviewOrigin)
	bindingHash, ok := decodeBindingHash(binding)
	if !ok {
		t.Fatal("test binding is invalid")
	}
	params := ConsumeAuthCodeParams{
		CodeHash:           hashHandoffCode(code),
		Origin:             ptr(testPreviewOrigin),
		BrowserBindingID:   ptr(binding.ID),
		BrowserBindingHash: bindingHash,
	}
	insertAuthCodeFixture(t, authCodeFixture{
		codeHash:           params.CodeHash,
		userID:             user.ID,
		origin:             params.Origin,
		redirect:           "/prep",
		browserBindingID:   params.BrowserBindingID,
		browserBindingHash: params.BrowserBindingHash,
		expiresAt:          time.Now().Add(codeTTL),
	})

	conflictingToken, conflictingHash, err := newSecret()
	if err != nil {
		t.Fatal(err)
	}
	insertSessionFixture(t, conflictingHash, user.ID, time.Now().Add(sessionTTL))

	_, err = service.exchangeHandoffCode(
		ctx,
		params,
		conflictingToken,
		conflictingHash,
	)
	var pgErr *pgconn.PgError
	if !errors.As(err, &pgErr) || pgErr.Code != "23505" {
		t.Fatalf("exchange error = %v, want unique violation", err)
	}
	assertHandoffCodeCount(t, params.CodeHash, 1)

	exchange, err := service.ExchangeHandoffCode(
		ctx,
		code,
		testPreviewOrigin,
		binding.ID,
		bindingHash,
	)
	if err != nil {
		t.Fatalf("retry exchange failed: %v", err)
	}
	if exchange.Redirect != "/prep" || !validSecret(exchange.SessionToken) {
		t.Fatalf("unexpected retry exchange: %+v", exchange)
	}
	assertHandoffCodeCount(t, params.CodeHash, 0)
	if sessionUser, _, err := service.SessionUser(ctx, exchange.SessionToken); err != nil {
		t.Fatalf("retry session lookup failed: %v", err)
	} else if sessionUser.ID != user.ID {
		t.Fatalf("retry session user = %s, want %s", sessionUser.ID, user.ID)
	}
}

func TestConcurrentHandoffExchangeCreatesOneSession(t *testing.T) {
	ctx := context.Background()
	service := NewService(testPool, Config{
		CanonicalOrigin:     testCanonical,
		PreviewOriginSuffix: "-scope.vercel.app",
	})
	user := seedHandoffUser(t)
	code, _, err := newSecret()
	if err != nil {
		t.Fatal(err)
	}
	binding, _ := newTestOAuthBinding(t, testPreviewOrigin)
	bindingHash, ok := decodeBindingHash(binding)
	if !ok {
		t.Fatal("test binding is invalid")
	}
	codeHash := hashHandoffCode(code)
	insertAuthCodeFixture(t, authCodeFixture{
		codeHash:           codeHash,
		userID:             user.ID,
		origin:             ptr(testPreviewOrigin),
		redirect:           "/prep",
		browserBindingID:   ptr(binding.ID),
		browserBindingHash: bindingHash,
		expiresAt:          time.Now().Add(codeTTL),
	})

	type result struct {
		exchange HandoffExchange
		err      error
	}
	start := make(chan struct{})
	results := make(chan result, 2)
	for range 2 {
		go func() {
			<-start
			exchange, err := service.ExchangeHandoffCode(
				ctx,
				code,
				testPreviewOrigin,
				binding.ID,
				bindingHash,
			)
			results <- result{exchange: exchange, err: err}
		}()
	}
	close(start)

	var succeeded, rejected int
	var sessionToken string
	for range 2 {
		result := <-results
		switch {
		case result.err == nil:
			succeeded++
			sessionToken = result.exchange.SessionToken
		case errors.Is(result.err, pgx.ErrNoRows):
			rejected++
		default:
			t.Fatalf("concurrent exchange error = %v", result.err)
		}
	}
	if succeeded != 1 || rejected != 1 {
		t.Fatalf("concurrent exchanges: %d succeeded, %d rejected", succeeded, rejected)
	}
	assertHandoffCodeCount(t, codeHash, 0)
	assertSessionCount(t, user.ID, 1)
	if sessionUser, _, err := service.SessionUser(ctx, sessionToken); err != nil {
		t.Fatalf("winning session lookup failed: %v", err)
	} else if sessionUser.ID != user.ID {
		t.Fatalf("winning session user = %s, want %s", sessionUser.ID, user.ID)
	}
}

func assertHandoffCodeCount(t *testing.T, codeHash []byte, want int) {
	t.Helper()
	var count int
	if err := testPool.QueryRow(
		context.Background(),
		"select count(*) from auth_codes where code_hash = $1",
		codeHash,
	).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != want {
		t.Fatalf("handoff code count = %d, want %d", count, want)
	}
}

func seedHandoffUser(t *testing.T) User {
	t.Helper()
	key := uuid.NewString()
	user, err := New(testPool).UpsertUser(context.Background(), UpsertUserParams{
		GoogleSub: "handoff-" + key,
		Email:     "handoff-" + key + "@example.com",
		Name:      "Handoff exchange fixture",
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), "delete from users where id = $1", user.ID)
	})
	return user
}

func assertSessionCount(t *testing.T, userID uuid.UUID, want int) {
	t.Helper()
	var count int
	if err := testPool.QueryRow(
		context.Background(),
		"select count(*) from sessions where user_id = $1",
		userID,
	).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != want {
		t.Fatalf("session count = %d, want %d", count, want)
	}
}
