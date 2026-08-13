package progress

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"

	"github.com/do-indeksa/platform/apps/api/internal/api"
)

func TestRecordAttemptsAcceptsBoundedSingleJSONDocuments(t *testing.T) {
	base := `[{"taskId":"log-001","slot":3,"correct":true,"source":"practice","futureField":true}]`
	tests := []struct {
		name        string
		target      string
		body        string
		contentType string
	}{
		{
			name:        "parameterized media type and trailing whitespace",
			target:      "/v1/attempts",
			body:        base + " \n\t",
			contentType: "application/json; charset=utf-8",
		},
		{
			name:        "api alias at exact body limit",
			target:      "/api/v1/attempts",
			body:        base + strings.Repeat(" ", maxBodyBytes-len(base)),
			contentType: "application/json",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := newTestApp(t)
			user, session := seedUserSession(t, "-strict-success-"+uuid.NewString())
			request := attemptRequest(
				t,
				tt.target,
				strings.NewReader(tt.body),
				tt.contentType,
				session,
			)
			response := httptest.NewRecorder()

			app.ServeHTTP(response, request)

			if response.Code != http.StatusNoContent {
				t.Fatalf("record returned %d: %s", response.Code, response.Body.String())
			}
			assertAttemptRowCount(t, user.ID, 1)
		})
	}
}

func TestRecordAttemptsRejectsInvalidJSONFramingWithoutWrites(t *testing.T) {
	tests := []struct {
		name        string
		body        io.Reader
		contentType string
		status      int
		code        string
	}{
		{
			name:   "missing media type",
			body:   strings.NewReader(validAttemptJSON()),
			status: http.StatusUnsupportedMediaType,
			code:   "unsupported_media_type",
		},
		{
			name:        "wrong media type",
			body:        strings.NewReader(validAttemptJSON()),
			contentType: "text/plain",
			status:      http.StatusUnsupportedMediaType,
			code:        "unsupported_media_type",
		},
		{
			name:        "malformed media type",
			body:        strings.NewReader(validAttemptJSON()),
			contentType: `application/json; charset="`,
			status:      http.StatusUnsupportedMediaType,
			code:        "unsupported_media_type",
		},
		{
			name:        "empty body",
			body:        strings.NewReader(""),
			contentType: "application/json",
			status:      http.StatusBadRequest,
			code:        "invalid_body",
		},
		{
			name:        "null body",
			body:        strings.NewReader("null"),
			contentType: "application/json",
			status:      http.StatusBadRequest,
			code:        "invalid_body",
		},
		{
			name:        "trailing document",
			body:        strings.NewReader(validAttemptJSON() + ` {"second":true}`),
			contentType: "application/json",
			status:      http.StatusBadRequest,
			code:        "invalid_body",
		},
		{
			name: "streamed oversized body",
			body: io.MultiReader(
				strings.NewReader(validAttemptJSON()),
				strings.NewReader(strings.Repeat(" ", maxBodyBytes)),
			),
			contentType: "application/json",
			status:      http.StatusRequestEntityTooLarge,
			code:        "request_too_large",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			app := newTestApp(t)
			user, session := seedUserSession(t, "-strict-failure-"+uuid.NewString())
			request := attemptRequest(t, "/v1/attempts", tt.body, tt.contentType, session)
			if tt.name == "streamed oversized body" && request.ContentLength != -1 {
				t.Fatalf("streamed body content length = %d, want -1", request.ContentLength)
			}
			response := httptest.NewRecorder()

			app.ServeHTTP(response, request)

			assertProgressError(t, response.Result(), tt.status, tt.code)
			assertAttemptRowCount(t, user.ID, 0)
		})
	}
}

func TestRecordAttemptsRejectsDeclaredOversizedBodyWithoutReading(t *testing.T) {
	app := newTestApp(t)
	user, session := seedUserSession(t, "-declared-size-"+uuid.NewString())
	request := attemptRequest(t, "/v1/attempts", panicReader{}, "application/json", session)
	request.ContentLength = maxBodyBytes + 1
	response := httptest.NewRecorder()

	app.ServeHTTP(response, request)

	assertProgressError(
		t,
		response.Result(),
		http.StatusRequestEntityTooLarge,
		"request_too_large",
	)
	assertAttemptRowCount(t, user.ID, 0)
}

func validAttemptJSON() string {
	return `[{"taskId":"log-001","slot":3,"correct":true,"source":"practice"}]`
}

func attemptRequest(
	t *testing.T,
	target string,
	body io.Reader,
	contentType string,
	session *http.Cookie,
) *http.Request {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, target, body)
	request.Host = "doindeksa.rs"
	request.Header.Set("Origin", "https://doindeksa.rs")
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	request.AddCookie(session)
	return request
}

func assertProgressError(t *testing.T, response *http.Response, status int, code string) {
	t.Helper()
	if response.StatusCode != status {
		t.Fatalf("status = %d, want %d", response.StatusCode, status)
	}
	if contentType := response.Header.Get("Content-Type"); !strings.HasPrefix(contentType, "application/json") {
		t.Fatalf("content type = %q, want application/json", contentType)
	}
	var apiErr api.Error
	if err := json.NewDecoder(response.Body).Decode(&apiErr); err != nil {
		t.Fatal(err)
	}
	if apiErr.Code != code {
		t.Fatalf("error code = %q, want %q", apiErr.Code, code)
	}
}

func assertAttemptRowCount(t *testing.T, userID uuid.UUID, want int) {
	t.Helper()
	var count int
	if err := testPool.QueryRow(
		context.Background(),
		"select count(*) from attempts where user_id = $1",
		userID,
	).Scan(&count); err != nil {
		t.Fatal(err)
	}
	if count != want {
		t.Fatalf("attempt row count = %d, want %d", count, want)
	}
}

type panicReader struct{}

func (panicReader) Read([]byte) (int, error) {
	panic("declared oversized body was read")
}
