package graph

import (
	"bytes"
	"context"
	"encoding/json"
	"log"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/testcontainers/testcontainers-go"
	"github.com/testcontainers/testcontainers-go/modules/postgres"
	"github.com/testcontainers/testcontainers-go/wait"

	"github.com/do-indeksa/platform/apps/api/db"
	"github.com/do-indeksa/platform/apps/api/internal/auth"
	"github.com/do-indeksa/platform/apps/api/internal/prep"
	"github.com/do-indeksa/platform/apps/api/internal/progress"
	"github.com/do-indeksa/platform/apps/api/internal/training"
)

var (
	graphTestPool *pgxpool.Pool
	graphAuth     *auth.Service
	graphApp      http.Handler
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
	graphTestPool, err = pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatal(err)
	}
	if err := db.Migrate(graphTestPool); err != nil {
		log.Fatal(err)
	}
	graphAuth = auth.NewService(graphTestPool, auth.Config{CanonicalOrigin: "https://doindeksa.rs"})
	progressService := progress.NewService(graphTestPool)
	prepService := prep.NewService(graphTestPool)
	trainingService := training.NewService(graphTestPool)
	router := chi.NewRouter()
	router.Use(auth.UnsafeRequestOriginMiddleware(graphAuth))
	router.With(auth.RequestUserMiddleware(graphAuth)).Handle(
		"/graphql",
		NewHandler(NewResolver(progressService, prepService, trainingService)),
	)
	graphApp = router

	code := m.Run()
	graphTestPool.Close()
	_ = testcontainers.TerminateContainer(container)
	os.Exit(code)
}

type graphResponse struct {
	Data   json.RawMessage `json:"data"`
	Errors []graphError    `json:"errors"`
}

type graphError struct {
	Message    string         `json:"message"`
	Extensions map[string]any `json:"extensions"`
}

func graphRequest(
	t *testing.T,
	query string,
	variables map[string]any,
	session *http.Cookie,
) (*http.Response, graphResponse) {
	t.Helper()
	body, err := json.Marshal(map[string]any{"query": query, "variables": variables})
	if err != nil {
		t.Fatal(err)
	}
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/graphql", bytes.NewReader(body))
	request.Host = "doindeksa.rs"
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Origin", "https://doindeksa.rs")
	if session != nil {
		request.AddCookie(session)
	}
	graphApp.ServeHTTP(recorder, request)
	response := recorder.Result()
	var payload graphResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatalf("decode GraphQL response: %v", err)
	}
	return response, payload
}

func seedGraphSession(t *testing.T, suffix string) *http.Cookie {
	t.Helper()
	user, err := auth.New(graphTestPool).UpsertUser(context.Background(), auth.UpsertUserParams{
		GoogleSub: "graph-" + t.Name() + suffix,
		Email:     strings.ToLower(strings.ReplaceAll(t.Name(), "/", "-")) + suffix + "@example.com",
		Name:      "Graph Test",
	})
	if err != nil {
		t.Fatal(err)
	}
	token, err := graphAuth.IssueSession(context.Background(), user.ID)
	if err != nil {
		t.Fatal(err)
	}
	return &http.Cookie{Name: auth.SessionCookieName, Value: token}
}

func requireGraphSuccess(t *testing.T, payload graphResponse) {
	t.Helper()
	if len(payload.Errors) != 0 {
		t.Fatalf("unexpected GraphQL errors: %+v", payload.Errors)
	}
}

func requireGraphCode(t *testing.T, payload graphResponse, code string) {
	t.Helper()
	if len(payload.Errors) == 0 || payload.Errors[0].Extensions["code"] != code {
		t.Fatalf("got errors %+v, want code %q", payload.Errors, code)
	}
}
