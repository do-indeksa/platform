package auth

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var accountOwnedTables = []string{
	"auth_codes",
	"attempts",
	"prep_preferences",
	"run_checkpoint_drafts",
	"run_checkpoints",
	"run_items",
	"runs",
	"sessions",
	"training_builder_drafts",
	"users",
}

type accountFixture struct {
	user     User
	sessions []*http.Cookie
}

func seedAccountFixture(t *testing.T, sessionExpiries ...time.Time) accountFixture {
	t.Helper()
	ctx := context.Background()
	queries := New(testPool)
	key := uuid.NewString()
	user, err := queries.UpsertUser(ctx, UpsertUserParams{
		GoogleSub: "account-deletion-" + key,
		Email:     key + "@example.com",
		Name:      "Account deletion fixture",
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = testPool.Exec(context.Background(), "delete from users where id = $1", user.ID)
	})

	sessions := make([]*http.Cookie, 0, len(sessionExpiries))
	for _, expiresAt := range sessionExpiries {
		token, tokenHash, err := newSecret()
		if err != nil {
			t.Fatal(err)
		}
		insertSessionFixture(t, tokenHash, user.ID, expiresAt)
		sessions = append(sessions, &http.Cookie{Name: localSessionCookieName, Value: token})
	}

	return accountFixture{user: user, sessions: sessions}
}

func seedAllAccountData(t *testing.T, fixture accountFixture) {
	t.Helper()
	ctx := context.Background()
	runID := uuid.New()
	runItemID := uuid.New()
	codeHash := make([]byte, 32)
	copy(codeHash, uuid.NewString())

	statements := []struct {
		query string
		args  []any
	}{
		{
			`insert into auth_codes (code_hash, user_id, redirect, expires_at)
			 values ($1, $2, '/', now() + interval '1 hour')`,
			[]any{codeHash, fixture.user.ID},
		},
		{
			`insert into runs (
				id, user_id, kind, blueprint_version, content_revision, started_at
			) values ($1, $2, 'practice', '2026.1', 'test-revision', now())`,
			[]any{runID, fixture.user.ID},
		},
		{
			`insert into run_items (
				id, run_id, user_id, task_id, ordinal, exam_position, topic,
				task_revision, answer_part_count
			) values ($1, $2, $3, 'test-task', 1, 1, 'algebra', 'test-revision', 1)`,
			[]any{runItemID, runID, fixture.user.ID},
		},
		{
			`insert into run_checkpoints (run_id, user_id, version, current_ordinal)
			 values ($1, $2, 1, 1)`,
			[]any{runID, fixture.user.ID},
		},
		{
			`insert into run_checkpoint_drafts (run_id, run_item_id, user_id, answer)
			 values ($1, $2, $3, 'draft')`,
			[]any{runID, runItemID, fixture.user.ID},
		},
		{
			`insert into attempts (
				user_id, task_id, slot, correct, source, help_level, run_item_id,
				started_at, submitted_at, outcome, grading_kind, task_revision
			) values (
				$1, 'test-task', 1, false, 'practice', 0, $2,
				now(), now(), 'incorrect', 'auto', 'test-revision'
			)`,
			[]any{fixture.user.ID, runItemID},
		},
		{
			`insert into prep_preferences (user_id, goal_points, exam_date)
			 values ($1, 42, date '2026-09-01')`,
			[]any{fixture.user.ID},
		},
		{
			`insert into training_builder_drafts (
				user_id, blueprint_version, position_1_quantity, difficulty,
				only_new, shuffle, prioritize_mistakes
			) values ($1, '2026.1', 1, 'balanced', false, true, true)`,
			[]any{fixture.user.ID},
		},
	}

	for _, statement := range statements {
		if _, err := testPool.Exec(ctx, statement.query, statement.args...); err != nil {
			t.Fatal(err)
		}
	}
}

func accountRowCounts(t *testing.T, userID uuid.UUID) map[string]int64 {
	t.Helper()
	ctx := context.Background()
	counts := make(map[string]int64, len(accountOwnedTables))
	for _, table := range accountOwnedTables {
		column := "user_id"
		if table == "users" {
			column = "id"
		}
		query := fmt.Sprintf("select count(*) from %s where %s = $1", table, column)
		var count int64
		if err := testPool.QueryRow(ctx, query, userID).Scan(&count); err != nil {
			t.Fatal(err)
		}
		counts[table] = count
	}
	return counts
}

func TestAccountDeletionFixtureCoversEveryUserOwnedTable(t *testing.T) {
	rows, err := testPool.Query(context.Background(), `
		with recursive user_owned_tables (table_id) as (
			select 'public.users'::regclass::oid
			union
			select constraint_row.conrelid
			from pg_constraint constraint_row
			join user_owned_tables parent on parent.table_id = constraint_row.confrelid
			where constraint_row.contype = 'f'
		)
		select table_row.relname
		from user_owned_tables owned
		join pg_class table_row on table_row.oid = owned.table_id
		order by table_row.relname
	`)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()

	expected := make(map[string]struct{}, len(accountOwnedTables))
	for _, table := range accountOwnedTables {
		expected[table] = struct{}{}
	}
	for rows.Next() {
		var table string
		if err := rows.Scan(&table); err != nil {
			t.Fatal(err)
		}
		if _, ok := expected[table]; !ok {
			t.Errorf("user-owned table %q is missing from the deletion fixture", table)
			continue
		}
		delete(expected, table)
	}
	if err := rows.Err(); err != nil {
		t.Fatal(err)
	}
	for table := range expected {
		t.Errorf("deletion fixture names unknown user-owned table %q", table)
	}
}

func TestDeleteAccountCascadesServerDataAndRevokesEverySession(t *testing.T) {
	app := newTestApp(t, newFakeGoogle(t, userinfo{}))
	target := seedAccountFixture(
		t,
		time.Now().Add(sessionTTL),
		time.Now().Add(sessionTTL),
	)
	neighbor := seedAccountFixture(t, time.Now().Add(sessionTTL))
	seedAllAccountData(t, target)
	seedAllAccountData(t, neighbor)
	for table, count := range accountRowCounts(t, target.user.ID) {
		if count == 0 {
			t.Fatalf("deletion fixture did not populate %s", table)
		}
	}
	neighborBefore := accountRowCounts(t, neighbor.user.ID)

	res := do(t, app, http.MethodDelete, "/api/v1/me", "localhost:3000", target.sessions[0])
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("delete account returned %d", res.StatusCode)
	}
	if res.ContentLength > 0 {
		t.Fatalf("delete account returned a body with length %d", res.ContentLength)
	}
	cookies := res.Cookies()
	if len(cookies) != 1 || cookies[0].Name != localSessionCookieName ||
		cookies[0].Value != "" || cookies[0].Path != "/" || cookies[0].MaxAge >= 0 ||
		!cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteLaxMode {
		t.Fatalf("unexpected deletion cookie: %+v", cookies)
	}

	for table, count := range accountRowCounts(t, target.user.ID) {
		if count != 0 {
			t.Errorf("%s retained %d target rows", table, count)
		}
	}
	neighborAfter := accountRowCounts(t, neighbor.user.ID)
	for table, before := range neighborBefore {
		if after := neighborAfter[table]; after != before {
			t.Errorf("%s neighbor rows changed from %d to %d", table, before, after)
		}
	}
	for _, session := range target.sessions {
		if _, _, err := NewService(testPool, Config{}).SessionUser(
			context.Background(),
			session.Value,
		); !errors.Is(err, pgx.ErrNoRows) {
			t.Errorf("deleted account session remained valid: %v", err)
		}
	}

	res = do(t, app, http.MethodGet, "/v1/me", "localhost:3000", neighbor.sessions[0])
	if res.StatusCode != http.StatusOK {
		t.Fatalf("neighbor session returned %d after deletion", res.StatusCode)
	}
	res = do(t, app, http.MethodDelete, "/v1/me", "localhost:3000", target.sessions[0])
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("repeated deletion returned %d", res.StatusCode)
	}
}

func TestDeleteAccountRequiresCurrentSession(t *testing.T) {
	app := newTestApp(t, newFakeGoogle(t, userinfo{}))

	res := do(t, app, http.MethodDelete, "/v1/me", "localhost:3000")
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("missing session returned %d", res.StatusCode)
	}
	wantBody := resBody(t, res)

	expired := seedAccountFixture(t, time.Now().Add(-time.Minute))
	res = do(t, app, http.MethodDelete, "/v1/me", "localhost:3000", expired.sessions[0])
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expired session returned %d", res.StatusCode)
	}
	if body := resBody(t, res); body != wantBody {
		t.Fatalf("expired session body %q differs from missing session body %q", body, wantBody)
	}
	if count := accountRowCounts(t, expired.user.ID)["users"]; count != 1 {
		t.Fatalf("expired session changed the account count to %d", count)
	}

	consumed := seedAccountFixture(t, time.Now().Add(sessionTTL))
	res = do(t, app, http.MethodDelete, "/v1/me", "localhost:3000", consumed.sessions[0])
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("initial deletion returned %d", res.StatusCode)
	}
	res = do(t, app, http.MethodDelete, "/v1/me", "localhost:3000", consumed.sessions[0])
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("consumed session returned %d", res.StatusCode)
	}
	if body := resBody(t, res); body != wantBody {
		t.Fatalf("consumed session body %q differs from missing session body %q", body, wantBody)
	}
}

func TestDeleteAccountClearsHostPrefixedHTTPSCookie(t *testing.T) {
	fixture := seedAccountFixture(t, time.Now().Add(sessionTTL))
	session := *fixture.sessions[0]
	session.Name = SessionCookieName
	handler := NewHandler(NewService(testPool, Config{CanonicalOrigin: "https://doindeksa.rs"}))
	request := httptest.NewRequest(http.MethodDelete, "https://doindeksa.rs/v1/me", nil)
	request.AddCookie(&session)
	response := httptest.NewRecorder()

	handler.DeleteAccount(response, request)

	if response.Code != http.StatusNoContent {
		t.Fatalf("HTTPS deletion returned %d", response.Code)
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != SessionCookieName ||
		cookies[0].Value != "" || cookies[0].Path != "/" || cookies[0].Domain != "" ||
		cookies[0].MaxAge >= 0 || !cookies[0].HttpOnly || !cookies[0].Secure ||
		cookies[0].SameSite != http.SameSiteLaxMode {
		t.Fatalf("unexpected HTTPS deletion cookie: %+v", cookies)
	}
}

func TestDeleteAccountRejectsCrossOriginRequest(t *testing.T) {
	app := newTestApp(t, newFakeGoogle(t, userinfo{}))
	fixture := seedAccountFixture(t, time.Now().Add(sessionTTL))

	request := httptest.NewRequest(http.MethodDelete, "/v1/me", nil)
	request.Host = "localhost:3000"
	request.Header.Set("Origin", "https://evil.example")
	request.AddCookie(fixture.sessions[0])
	response := httptest.NewRecorder()
	app.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden {
		t.Fatalf("cross-origin deletion returned %d", response.Code)
	}
	if cookies := response.Result().Cookies(); len(cookies) != 0 {
		t.Fatalf("cross-origin deletion changed cookies: %+v", cookies)
	}

	res := do(t, app, http.MethodGet, "/v1/me", "localhost:3000", fixture.sessions[0])
	if res.StatusCode != http.StatusOK {
		t.Fatalf("cross-origin request deleted account: GET /me returned %d", res.StatusCode)
	}
}

func resBody(t *testing.T, res *http.Response) string {
	t.Helper()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if err := res.Body.Close(); err != nil {
		t.Fatal(err)
	}
	return string(body)
}
