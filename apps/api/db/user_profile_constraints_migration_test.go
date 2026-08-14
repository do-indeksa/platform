package db

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/pressly/goose/v3"
)

const userProfileConstraintsMigration = 15

var userProfileConstraints = []struct {
	name       string
	definition string
}{
	{name: "users_google_sub_size", definition: "octet_length(google_sub)"},
	{name: "users_email_size", definition: "octet_length(email)"},
	{name: "users_name_size", definition: "char_length(name)"},
	{name: "users_picture_url_size", definition: "octet_length(picture_url)"},
}

func assertUserProfileConstraintsMigrationRoundTrip(
	t *testing.T,
	ctx context.Context,
	provider *goose.Provider,
	pool *pgxpool.Pool,
	userID uuid.UUID,
) {
	t.Helper()
	applyMigrationsThrough(t, ctx, provider, userProfileConstraintsMigration-1)
	assertUserProfileConstraints(t, ctx, pool, false)

	applyMigrationsThrough(t, ctx, provider, userProfileConstraintsMigration)
	assertUserProfileConstraints(t, ctx, pool, true)
	assertProfileRowPreserved(t, ctx, pool, userID)
	assertUserProfileBoundaries(t, ctx, pool)
	assertInvalidUserProfilesRejected(t, ctx, pool)

	rollbackMigrationsTo(t, ctx, provider, userProfileConstraintsMigration-1)
	assertUserProfileConstraints(t, ctx, pool, false)
	assertProfileRowPreserved(t, ctx, pool, userID)
	assertOversizedProfileAllowedWithoutConstraints(t, ctx, pool)

	applyMigrationsThrough(t, ctx, provider, userProfileConstraintsMigration)
	assertUserProfileConstraints(t, ctx, pool, true)
	assertProfileRowPreserved(t, ctx, pool, userID)
}

func assertUserProfileConstraints(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
	want bool,
) {
	t.Helper()
	for _, constraint := range userProfileConstraints {
		var definition string
		var validated bool
		err := pool.QueryRow(ctx, `
			select pg_get_constraintdef(oid), convalidated
			from pg_constraint
			where conrelid = 'users'::regclass and conname = $1`,
			constraint.name,
		).Scan(&definition, &validated)
		if !want {
			if !errors.Is(err, pgx.ErrNoRows) {
				t.Fatalf("constraint %s lookup error = %v, want no rows", constraint.name, err)
			}
			continue
		}
		if err != nil {
			t.Fatalf("constraint %s lookup: %v", constraint.name, err)
		}
		if !validated || !strings.Contains(definition, constraint.definition) {
			t.Fatalf("constraint %s = %q validated=%v", constraint.name, definition, validated)
		}
	}
}

func assertProfileRowPreserved(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
	userID uuid.UUID,
) {
	t.Helper()
	var subject, email, name string
	var picture *string
	if err := pool.QueryRow(ctx, `
		select google_sub, email, name, picture_url
		from users
		where id = $1`, userID,
	).Scan(&subject, &email, &name, &picture); err != nil {
		t.Fatal(err)
	}
	if subject != "auth-code-migration" || email != "migration@example.com" ||
		name != "Migration" || picture != nil {
		t.Fatalf("profile row changed: subject=%q email=%q name=%q picture=%v", subject, email, name, picture)
	}
}

func assertUserProfileBoundaries(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `
		insert into users (google_sub, email, name, picture_url)
		values ($1, $2, $3, $4)`,
		strings.Repeat("s", 255),
		strings.Repeat("e", 315)+"@x.io",
		strings.Repeat("č", 256),
		strings.Repeat("p", 2048),
	); err != nil {
		t.Fatalf("profile boundary insert failed: %v", err)
	}
}

func assertInvalidUserProfilesRejected(t *testing.T, ctx context.Context, pool *pgxpool.Pool) {
	t.Helper()
	tests := []struct {
		name       string
		subject    string
		email      string
		display    string
		picture    *string
		constraint string
	}{
		{name: "empty subject", email: "empty-sub@example.com", display: "Name", constraint: "users_google_sub_size"},
		{name: "oversized subject", subject: strings.Repeat("s", 256), email: "large-sub@example.com", display: "Name", constraint: "users_google_sub_size"},
		{name: "short email", subject: "short-email", email: "x", display: "Name", constraint: "users_email_size"},
		{name: "oversized email", subject: "large-email", email: strings.Repeat("e", 321), display: "Name", constraint: "users_email_size"},
		{name: "empty name", subject: "empty-name", email: "empty-name@example.com", constraint: "users_name_size"},
		{name: "oversized name", subject: "large-name", email: "large-name@example.com", display: strings.Repeat("č", 257), constraint: "users_name_size"},
		{name: "empty picture", subject: "empty-picture", email: "empty-picture@example.com", display: "Name", picture: stringPointer(""), constraint: "users_picture_url_size"},
		{name: "oversized picture", subject: "large-picture", email: "large-picture@example.com", display: "Name", picture: stringPointer(strings.Repeat("p", 2049)), constraint: "users_picture_url_size"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			tx, err := pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer func() { _ = tx.Rollback(ctx) }()
			_, err = tx.Exec(ctx, `
				insert into users (google_sub, email, name, picture_url)
				values ($1, $2, $3, $4)`,
				tt.subject, tt.email, tt.display, tt.picture,
			)
			var postgresError *pgconn.PgError
			if !errors.As(err, &postgresError) || postgresError.Code != "23514" ||
				postgresError.ConstraintName != tt.constraint {
				t.Fatalf("insert error = %v, want 23514 from %s", err, tt.constraint)
			}
		})
	}
}

func assertOversizedProfileAllowedWithoutConstraints(
	t *testing.T,
	ctx context.Context,
	pool *pgxpool.Pool,
) {
	t.Helper()
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err := tx.Exec(ctx, `
		insert into users (google_sub, email, name)
		values ($1, 'rollback@example.com', 'Rollback')`,
		strings.Repeat("s", 256),
	); err != nil {
		t.Fatalf("rolled-back constraints still rejected an oversized profile: %v", err)
	}
}

func stringPointer(value string) *string {
	return &value
}
