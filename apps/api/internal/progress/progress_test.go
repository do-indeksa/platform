package progress

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/do-indeksa/platform/apps/api/db"
	"github.com/do-indeksa/platform/apps/api/internal/api"
	"github.com/do-indeksa/platform/apps/api/internal/auth"
)

var (
	testPool *pgxpool.Pool
	authSvc  *auth.Service
)

func TestMain(m *testing.M) {
	ctx := context.Background()
	container, err := postgres.Run(ctx, "postgres:17-alpine",
		postgres.WithDatabase("test"),
		postgres.WithUsername("test"),
		postgres.WithPassword("test"),
		testcontainers.WithWaitStrategy(
			wait.ForLog("database system is ready to accept connections").
				WithOccurrence(2).WithStartupTimeout(time.Minute)))
	if err != nil {
		log.Fatal(err)
	}
	dsn, err := container.ConnectionString(ctx, "sslmode=disable")
	if err != nil {
		log.Fatal(err)
	}
	testPool, err = pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatal(err)
	}
	if err := db.Migrate(testPool); err != nil {
		log.Fatal(err)
	}
	authSvc = auth.NewService(testPool, auth.Config{CanonicalOrigin: "https://doindeksa.rs"})
	code := m.Run()
	testPool.Close()
	_ = testcontainers.TerminateContainer(container)
	os.Exit(code)
}

type authHandler = auth.Handler

type testServer struct {
	*authHandler
	*Handler
}

func newTestApp(t *testing.T) http.Handler {
	t.Helper()
	server := testServer{
		authHandler: auth.NewHandler(authSvc),
		Handler:     NewHandler(authSvc, NewService(testPool)),
	}
	router := chi.NewRouter()
	router.Use(auth.UnsafeRequestOriginMiddleware(authSvc))
	for _, baseURL := range []string{"", "/api"} {
		api.HandlerWithOptions(server, api.ChiServerOptions{
			BaseURL:          baseURL,
			BaseRouter:       router,
			ErrorHandlerFunc: auth.ParamErrorHandler,
		})
	}
	return router
}

func seedSession(t *testing.T, suffix string) *http.Cookie {
	t.Helper()
	_, session := seedUserSession(t, suffix)
	return session
}

func seedUserSession(t *testing.T, suffix string) (auth.User, *http.Cookie) {
	t.Helper()
	ctx := context.Background()
	user, err := auth.New(testPool).UpsertUser(ctx, auth.UpsertUserParams{
		GoogleSub: "seed-" + t.Name() + suffix,
		Email:     strings.ToLower(t.Name()+suffix) + "@example.com",
		Name:      "Seed",
	})
	if err != nil {
		t.Fatal(err)
	}
	token, err := authSvc.IssueSession(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	return user, &http.Cookie{Name: auth.SessionCookieName, Value: token}
}

func do(t *testing.T, app http.Handler, method, target string, body any, cookies ...*http.Cookie) *http.Response {
	t.Helper()
	var reader *bytes.Reader
	if body != nil {
		payload, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		reader = bytes.NewReader(payload)
	} else {
		reader = bytes.NewReader(nil)
	}
	rec := httptest.NewRecorder()
	req := httptest.NewRequest(method, target, reader)
	req.Host = "doindeksa.rs"
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for _, cookie := range cookies {
		req.AddCookie(cookie)
	}
	if method != http.MethodGet && method != http.MethodHead && method != http.MethodOptions {
		req.Header.Set("Origin", "https://doindeksa.rs")
	}
	app.ServeHTTP(rec, req)
	return rec.Result()
}

func TestAttemptsRequireSession(t *testing.T) {
	app := newTestApp(t)
	for _, method := range []string{"GET", "POST"} {
		res := do(t, app, method, "/v1/attempts", []api.NewAttempt{})
		if res.StatusCode != http.StatusUnauthorized {
			t.Fatalf("%s: got status %d", method, res.StatusCode)
		}
	}
}

func TestRecordAttemptsRejectsCrossOriginSession(t *testing.T) {
	app := newTestApp(t)
	session := seedSession(t, "")
	request := httptest.NewRequest(http.MethodPost, "/v1/attempts", strings.NewReader(`[{"taskId":"log-001","slot":3,"correct":true,"source":"practice"}]`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "https://evil.example")
	request.AddCookie(session)
	response := httptest.NewRecorder()

	app.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden || !strings.Contains(response.Body.String(), `"code":"cross_site_request"`) {
		t.Fatalf("cross-origin attempt returned %d: %s", response.Code, response.Body.String())
	}
}

func TestRecordAttemptsRejectsCrossOriginRequestWithoutSession(t *testing.T) {
	app := newTestApp(t)
	request := httptest.NewRequest(http.MethodPost, "/v1/attempts", strings.NewReader(`[]`))
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "https://evil.example")
	request.Header.Set("Sec-Fetch-Site", "cross-site")
	response := httptest.NewRecorder()

	app.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden ||
		!strings.Contains(response.Body.String(), `"code":"cross_site_request"`) {
		t.Fatalf("anonymous cross-origin attempt returned %d: %s", response.Code, response.Body.String())
	}
}

func TestRecordAndListRoundtrip(t *testing.T) {
	app := newTestApp(t)
	session := seedSession(t, "")
	past := time.Now().Add(-time.Hour).UTC().Truncate(time.Second)

	helpLevel := 2
	batch := []api.NewAttempt{
		{TaskId: "log-001", Slot: 3, Correct: true, Source: api.NewAttemptSourceDiagnostic, HelpLevel: &helpLevel, At: &past},
		{TaskId: "kb-002", Slot: 1, Correct: false, Source: api.NewAttemptSourcePractice},
	}
	res := do(t, app, "POST", "/v1/attempts", batch, session)
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("post: got status %d", res.StatusCode)
	}

	res = do(t, app, "GET", "/v1/attempts", nil, session)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("get: got status %d", res.StatusCode)
	}
	var attempts []api.Attempt
	if err := json.NewDecoder(res.Body).Decode(&attempts); err != nil {
		t.Fatal(err)
	}
	if len(attempts) != 2 {
		t.Fatalf("got %d attempts", len(attempts))
	}
	first, second := attempts[0], attempts[1]
	if first.TaskId != "log-001" || first.Slot != 3 || !first.Correct ||
		first.Source != api.AttemptSourceDiagnostic || first.HelpLevel != 2 || !first.At.Equal(past) {
		t.Fatalf("first attempt mismatch: %+v", first)
	}
	if second.TaskId != "kb-002" || second.Correct || second.Source != api.AttemptSourcePractice ||
		second.HelpLevel != 0 {
		t.Fatalf("second attempt mismatch: %+v", second)
	}
	if second.At.IsZero() || time.Since(second.At) > time.Minute {
		t.Fatalf("missing at not defaulted to now: %v", second.At)
	}
}

func TestLegacyProjectionKeepsOnlyBooleanGraphQLAttempts(t *testing.T) {
	app := newTestApp(t)
	user, session := seedUserSession(t, "")
	service := NewService(testPool)
	startedAt := time.Now().Add(-10 * time.Minute).UTC().Truncate(time.Microsecond)
	maxPoints := int16(6)
	earnedPoints := int16(3)
	items := []NewRunItem{
		{ID: uuid.New(), TaskID: "kb-001", ExamPosition: 1, Topic: "kompleksni-brojevi", MaxPoints: &maxPoints, TaskRevision: "rev-kb"},
		{ID: uuid.New(), TaskID: "kv-001", ExamPosition: 2, Topic: "kvadratna-jednacina", MaxPoints: &maxPoints, TaskRevision: "rev-kv"},
		{ID: uuid.New(), TaskID: "log-001", ExamPosition: 3, Topic: "logaritmi", MaxPoints: &maxPoints, TaskRevision: "rev-log"},
		{ID: uuid.New(), TaskID: "eks-001", ExamPosition: 4, Topic: "eksponencijalne-jednacine", MaxPoints: &maxPoints, TaskRevision: "rev-eks"},
	}
	runID := uuid.New()
	if _, err := service.StartRun(context.Background(), user.ID, StartRunInput{
		ID:               runID,
		Kind:             RunKindDiagnostic,
		BlueprintVersion: "diagnostic-v1",
		ContentRevision:  "content-revision",
		StartedAt:        startedAt,
		Items:            items,
	}); err != nil {
		t.Fatal(err)
	}

	outcomes := []struct {
		outcome AttemptOutcome
		earned  *int16
	}{
		{AttemptOutcomeCorrect, &maxPoints},
		{AttemptOutcomeIncorrect, nil},
		{AttemptOutcomeSkipped, nil},
		{AttemptOutcomePartial, &earnedPoints},
	}
	for index, outcome := range outcomes {
		submittedAt := startedAt.Add(time.Duration(index+1) * time.Minute)
		if _, err := service.RecordAttempt(context.Background(), user.ID, RecordAttemptInput{
			ID:           uuid.New(),
			RunItemID:    &items[index].ID,
			StartedAt:    submittedAt.Add(-30 * time.Second),
			SubmittedAt:  submittedAt,
			Outcome:      outcome.outcome,
			GradingKind:  GradingKindAuto,
			EarnedPoints: outcome.earned,
		}); err != nil {
			t.Fatalf("record %s: %v", outcome.outcome, err)
		}
	}

	aggregate, err := service.GetRun(context.Background(), user.ID, runID)
	if err != nil {
		t.Fatal(err)
	}
	if len(aggregate.Attempts) != len(outcomes) {
		t.Fatalf("GraphQL aggregate lost outcomes: got %d", len(aggregate.Attempts))
	}

	res := do(t, app, http.MethodGet, "/v1/attempts", nil, session)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("get: got status %d", res.StatusCode)
	}
	var attempts []api.Attempt
	if err := json.NewDecoder(res.Body).Decode(&attempts); err != nil {
		t.Fatal(err)
	}
	if len(attempts) != 2 || attempts[0].TaskId != "kb-001" || !attempts[0].Correct ||
		attempts[1].TaskId != "kv-001" || attempts[1].Correct {
		t.Fatalf("unexpected REST projection: %+v", attempts)
	}
	for index, attempt := range attempts {
		want := startedAt.Add(time.Duration(index+1) * time.Minute)
		if !attempt.At.Equal(want) {
			t.Fatalf("attempt %d timestamp = %v, want %v", index, attempt.At, want)
		}
	}
}

func TestFutureTimestampClamped(t *testing.T) {
	app := newTestApp(t)
	session := seedSession(t, "")
	future := time.Now().Add(time.Hour)

	res := do(t, app, "POST", "/v1/attempts", []api.NewAttempt{
		{TaskId: "trig-001", Slot: 5, Correct: true, Source: api.NewAttemptSourceSimulation, At: &future},
	}, session)
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("post: got status %d", res.StatusCode)
	}

	res = do(t, app, "GET", "/v1/attempts", nil, session)
	var attempts []api.Attempt
	if err := json.NewDecoder(res.Body).Decode(&attempts); err != nil {
		t.Fatal(err)
	}
	if len(attempts) != 1 || attempts[0].At.After(time.Now()) {
		t.Fatalf("future timestamp not clamped: %+v", attempts)
	}
}

func validBatch(size int) []api.NewAttempt {
	batch := make([]api.NewAttempt, size)
	for i := range batch {
		batch[i] = api.NewAttempt{TaskId: "x", Slot: 1, Source: api.NewAttemptSourcePractice}
	}
	return batch
}

func TestRecordValidation(t *testing.T) {
	app := newTestApp(t)
	session := seedSession(t, "")
	invalidHelpLevel := 4
	negativeHelpLevel := -1

	tests := []struct {
		name  string
		batch []api.NewAttempt
		code  string
	}{
		{"empty batch", []api.NewAttempt{}, "invalid_batch"},
		{"oversized batch", validBatch(maxBatchSize + 1), "invalid_batch"},
		{"empty task id", []api.NewAttempt{{TaskId: "", Slot: 1, Source: api.NewAttemptSourcePractice}}, "invalid_attempt"},
		{"long task id", []api.NewAttempt{{TaskId: strings.Repeat("a", 65), Slot: 1, Source: api.NewAttemptSourcePractice}}, "invalid_attempt"},
		{"uppercase task id", []api.NewAttempt{{TaskId: "KB-001", Slot: 1, Source: api.NewAttemptSourcePractice}}, "invalid_attempt"},
		{"slot out of range", []api.NewAttempt{{TaskId: "x", Slot: 11, Source: api.NewAttemptSourcePractice}}, "invalid_attempt"},
		{"unknown source", []api.NewAttempt{{TaskId: "x", Slot: 1, Source: "guess"}}, "invalid_attempt"},
		{"help level out of range", []api.NewAttempt{{TaskId: "x", Slot: 1, Source: api.NewAttemptSourcePractice, HelpLevel: &invalidHelpLevel}}, "invalid_attempt"},
		{"help level negative", []api.NewAttempt{{TaskId: "x", Slot: 1, Source: api.NewAttemptSourcePractice, HelpLevel: &negativeHelpLevel}}, "invalid_attempt"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res := do(t, app, "POST", "/v1/attempts", tt.batch, session)
			if res.StatusCode != http.StatusBadRequest {
				t.Fatalf("got status %d", res.StatusCode)
			}
			var apiErr api.Error
			if err := json.NewDecoder(res.Body).Decode(&apiErr); err != nil {
				t.Fatal(err)
			}
			if apiErr.Code != tt.code {
				t.Fatalf("got error code %q, want %q", apiErr.Code, tt.code)
			}
		})
	}
}

func TestOversizedBodyRejected(t *testing.T) {
	app := newTestApp(t)
	session := seedSession(t, "")

	batch := validBatch(3000)
	for i := range batch {
		batch[i].TaskId = strings.Repeat("a", 64)
	}
	res := do(t, app, "POST", "/v1/attempts", batch, session)
	if res.StatusCode != http.StatusRequestEntityTooLarge {
		t.Fatalf("got status %d", res.StatusCode)
	}
	var apiErr api.Error
	if err := json.NewDecoder(res.Body).Decode(&apiErr); err != nil {
		t.Fatal(err)
	}
	if apiErr.Code != "request_too_large" {
		t.Fatalf("got error code %q", apiErr.Code)
	}
}

func TestEmptyJournalIsJSONArray(t *testing.T) {
	app := newTestApp(t)
	session := seedSession(t, "")

	res := do(t, app, "GET", "/v1/attempts", nil, session)
	if res.StatusCode != http.StatusOK {
		t.Fatalf("got status %d", res.StatusCode)
	}
	raw, err := io.ReadAll(res.Body)
	if err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(string(raw)) != "[]" {
		t.Fatalf("got body %q, want []", raw)
	}
}

func TestSameTimestampBatchKeepsOrder(t *testing.T) {
	app := newTestApp(t)
	session := seedSession(t, "")
	at := time.Now().Add(-time.Minute).UTC().Truncate(time.Second)

	batch := make([]api.NewAttempt, 5)
	for i := range batch {
		batch[i] = api.NewAttempt{
			TaskId: fmt.Sprintf("kb-00%d", i),
			Slot:   1,
			Source: api.NewAttemptSourceDiagnostic,
			At:     &at,
		}
	}
	res := do(t, app, "POST", "/v1/attempts", batch, session)
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("post: got status %d", res.StatusCode)
	}

	res = do(t, app, "GET", "/v1/attempts", nil, session)
	var attempts []api.Attempt
	if err := json.NewDecoder(res.Body).Decode(&attempts); err != nil {
		t.Fatal(err)
	}
	if len(attempts) != len(batch) {
		t.Fatalf("got %d attempts", len(attempts))
	}
	for i, attempt := range attempts {
		if attempt.TaskId != batch[i].TaskId {
			t.Fatalf("order broken at %d: got %q", i, attempt.TaskId)
		}
	}
}

func TestListCapsAtMostRecentThousand(t *testing.T) {
	app := newTestApp(t)
	ctx := context.Background()
	user, err := auth.New(testPool).UpsertUser(ctx, auth.UpsertUserParams{
		GoogleSub: "seed-" + t.Name(),
		Email:     strings.ToLower(t.Name()) + "@example.com",
		Name:      "Seed",
	})
	if err != nil {
		t.Fatal(err)
	}
	token, err := authSvc.IssueSession(ctx, user.ID)
	if err != nil {
		t.Fatal(err)
	}
	session := &http.Cookie{Name: auth.SessionCookieName, Value: token}

	base := time.Now().Add(-2 * time.Hour).UTC()
	params := make([]InsertAttemptsParams, 1001)
	for i := range params {
		params[i] = InsertAttemptsParams{
			UserID:    user.ID,
			TaskID:    fmt.Sprintf("t-%04d", i),
			Slot:      1,
			Correct:   true,
			Source:    "practice",
			CreatedAt: base.Add(time.Duration(i) * time.Second),
		}
	}
	if _, err := New(testPool).InsertAttempts(ctx, params); err != nil {
		t.Fatal(err)
	}

	res := do(t, app, "GET", "/v1/attempts", nil, session)
	var attempts []api.Attempt
	if err := json.NewDecoder(res.Body).Decode(&attempts); err != nil {
		t.Fatal(err)
	}
	if len(attempts) != 1000 {
		t.Fatalf("got %d attempts, want 1000", len(attempts))
	}
	if attempts[0].TaskId != "t-0001" || attempts[999].TaskId != "t-1000" {
		t.Fatalf("cap kept wrong window: first %q last %q", attempts[0].TaskId, attempts[999].TaskId)
	}
}

func TestAttemptsAreScopedToUser(t *testing.T) {
	app := newTestApp(t)
	owner := seedSession(t, "-owner")
	other := seedSession(t, "-other")

	res := do(t, app, "POST", "/v1/attempts", []api.NewAttempt{
		{TaskId: "fun-001", Slot: 9, Correct: true, Source: api.NewAttemptSourcePractice},
	}, owner)
	if res.StatusCode != http.StatusNoContent {
		t.Fatalf("post: got status %d", res.StatusCode)
	}

	res = do(t, app, "GET", "/v1/attempts", nil, other)
	var attempts []api.Attempt
	if err := json.NewDecoder(res.Body).Decode(&attempts); err != nil {
		t.Fatal(err)
	}
	if len(attempts) != 0 {
		t.Fatalf("attempts leaked across users: %+v", attempts)
	}
}
