package graph

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/google/uuid"
)

func TestGraphQLAcceptsOneBoundedJSONObject(t *testing.T) {
	session := seedGraphTransportSession(t, "-strict-success")
	body := prepPreferencesRequestBody(t, 42)
	body[len(body)-1] = ','
	body = append(body, []byte(`"futureField":true}`)...)
	body = append(body, bytes.Repeat([]byte(" "), maxGraphQLBodyBytes-len(body))...)
	request := graphTransportRequest(
		t,
		bytes.NewReader(body),
		"application/json; charset=utf-8",
		session,
	)
	response := httptest.NewRecorder()

	graphApp.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("mutation returned %d: %s", response.Code, response.Body.String())
	}
	var payload graphResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	requireGraphSuccess(t, payload)
	assertGraphPrepPreferences(t, session, &prepPreferencesPayload{
		GoalPoints: 42,
		ExamDate:   "2028-02-29",
		Version:    1,
	})
}

func TestGraphQLRejectsInvalidFramingBeforeMutation(t *testing.T) {
	valid := prepPreferencesRequestBody(t, 42)
	tests := []struct {
		name        string
		body        io.Reader
		contentType string
		status      int
		code        string
	}{
		{
			name:   "missing media type",
			body:   bytes.NewReader(valid),
			status: http.StatusUnsupportedMediaType,
			code:   "UNSUPPORTED_MEDIA_TYPE",
		},
		{
			name:        "unsupported media type",
			body:        bytes.NewReader(valid),
			contentType: "text/plain",
			status:      http.StatusUnsupportedMediaType,
			code:        "UNSUPPORTED_MEDIA_TYPE",
		},
		{
			name:        "malformed media type",
			body:        bytes.NewReader(valid),
			contentType: `application/json; charset="`,
			status:      http.StatusUnsupportedMediaType,
			code:        "UNSUPPORTED_MEDIA_TYPE",
		},
		{
			name:        "empty body",
			body:        strings.NewReader(""),
			contentType: "application/json",
			status:      http.StatusBadRequest,
			code:        "BAD_REQUEST",
		},
		{
			name:        "malformed body",
			body:        strings.NewReader(`{"query":`),
			contentType: "application/json",
			status:      http.StatusBadRequest,
			code:        "BAD_REQUEST",
		},
		{
			name:        "null body",
			body:        strings.NewReader("null"),
			contentType: "application/json",
			status:      http.StatusBadRequest,
			code:        "BAD_REQUEST",
		},
		{
			name:        "array body",
			body:        strings.NewReader("[]"),
			contentType: "application/json",
			status:      http.StatusBadRequest,
			code:        "BAD_REQUEST",
		},
		{
			name:        "scalar body",
			body:        strings.NewReader(`"query"`),
			contentType: "application/json",
			status:      http.StatusBadRequest,
			code:        "BAD_REQUEST",
		},
		{
			name:        "trailing document",
			body:        io.MultiReader(bytes.NewReader(valid), strings.NewReader(` {"second":true}`)),
			contentType: "application/json",
			status:      http.StatusBadRequest,
			code:        "BAD_REQUEST",
		},
		{
			name:        "streamed oversized body",
			body:        io.MultiReader(bytes.NewReader(valid), strings.NewReader(strings.Repeat(" ", maxGraphQLBodyBytes))),
			contentType: "application/json",
			status:      http.StatusRequestEntityTooLarge,
			code:        "PAYLOAD_TOO_LARGE",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			session := seedGraphTransportSession(t, "-strict-failure")
			request := graphTransportRequest(t, tt.body, tt.contentType, session)
			if tt.name == "streamed oversized body" && request.ContentLength != -1 {
				t.Fatalf("streamed content length = %d, want -1", request.ContentLength)
			}
			response := httptest.NewRecorder()

			graphApp.ServeHTTP(response, request)

			assertGraphTransportError(t, response.Result(), tt.status, tt.code)
			assertGraphPrepPreferences(t, session, nil)
		})
	}
}

func TestGraphQLRejectsInvalidEnvelopeTypesWithoutReflectingBody(t *testing.T) {
	marker := "private-transport-marker"
	validMutation := string(prepPreferencesRequestBody(t, 42))
	tests := []struct {
		name string
		body string
	}{
		{name: "query", body: `{"query":{"marker":"` + marker + `"}}`},
		{name: "operation name", body: `{"query":"query { prepPreferences { version } }","operationName":["` + marker + `"]}`},
		{name: "variables", body: `{"query":"` + marker + `","variables":"invalid"}`},
		{name: "extensions", body: validMutation[:len(validMutation)-1] + `,"extensions":["` + marker + `"]}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			session := seedGraphTransportSession(t, "-invalid-envelope")
			request := graphTransportRequest(t, strings.NewReader(tt.body), "application/json", session)
			response := httptest.NewRecorder()

			graphApp.ServeHTTP(response, request)

			if strings.Contains(response.Body.String(), marker) {
				t.Fatalf("response reflected request marker: %s", response.Body.String())
			}
			assertGraphTransportError(t, response.Result(), http.StatusBadRequest, "BAD_REQUEST")
			assertGraphPrepPreferences(t, session, nil)
		})
	}
}

func TestGraphQLRejectsTrailingDocumentBeforeUpdatingExistingState(t *testing.T) {
	session := seedGraphTransportSession(t, "-strict-update")
	created := saveGraphPrepPreferences(t, session, 0, 42, "2028-02-29")
	body := prepPreferencesRequestBodyForVersion(t, created.Version, 55)
	body = append(body, []byte(` {"second":true}`)...)
	request := graphTransportRequest(t, bytes.NewReader(body), "application/json", session)
	response := httptest.NewRecorder()

	graphApp.ServeHTTP(response, request)

	assertGraphTransportError(t, response.Result(), http.StatusBadRequest, "BAD_REQUEST")
	assertGraphPrepPreferences(t, session, &created)
}

func TestGraphQLAdvertisesOnlyConfiguredMethods(t *testing.T) {
	request := httptest.NewRequest(http.MethodOptions, "/graphql", nil)
	response := httptest.NewRecorder()

	graphApp.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("OPTIONS returned %d: %s", response.Code, response.Body.String())
	}
	if allow := response.Header().Get("Allow"); allow != "OPTIONS, POST" {
		t.Fatalf("Allow = %q, want OPTIONS, POST", allow)
	}
}

func TestGraphQLClosesTheInboundBodyBeforeExecution(t *testing.T) {
	session := seedGraphTransportSession(t, "-body-close")
	body := &trackingGraphBody{Reader: bytes.NewReader(prepPreferencesRequestBody(t, 42))}
	request := graphTransportRequest(t, body, "application/json", session)
	response := httptest.NewRecorder()

	graphApp.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("mutation returned %d: %s", response.Code, response.Body.String())
	}
	if !body.closed {
		t.Fatal("inbound request body was not closed")
	}
}

func TestGraphQLSanitizesReadFailuresAndClosesTheBody(t *testing.T) {
	session := seedGraphTransportSession(t, "-read-failure")
	body := &failingGraphBody{marker: "private-read-failure"}
	request := graphTransportRequest(t, body, "application/json", session)
	response := httptest.NewRecorder()

	graphApp.ServeHTTP(response, request)

	if strings.Contains(response.Body.String(), body.marker) {
		t.Fatalf("response reflected read failure: %s", response.Body.String())
	}
	assertGraphTransportError(t, response.Result(), http.StatusBadRequest, "BAD_REQUEST")
	if !body.closed {
		t.Fatal("failed inbound request body was not closed")
	}
	assertGraphPrepPreferences(t, session, nil)
}

func TestGraphQLRejectsDeclaredOversizeWithoutReading(t *testing.T) {
	session := seedGraphTransportSession(t, "-declared-oversize")
	request := graphTransportRequest(t, graphPanicReader{}, "application/json", session)
	request.ContentLength = maxGraphQLBodyBytes + 1
	response := httptest.NewRecorder()

	graphApp.ServeHTTP(response, request)

	assertGraphTransportError(
		t,
		response.Result(),
		http.StatusRequestEntityTooLarge,
		"PAYLOAD_TOO_LARGE",
	)
	assertGraphPrepPreferences(t, session, nil)
}

func prepPreferencesRequestBody(t *testing.T, goalPoints int32) []byte {
	t.Helper()
	return prepPreferencesRequestBodyForVersion(t, 0, goalPoints)
}

func prepPreferencesRequestBodyForVersion(
	t *testing.T,
	expectedVersion int64,
	goalPoints int32,
) []byte {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"query": savePrepPreferencesMutation,
		"variables": map[string]any{
			"input": prepPreferencesInput(expectedVersion, goalPoints, "2028-02-29"),
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	return body
}

func seedGraphTransportSession(t *testing.T, suffix string) *http.Cookie {
	t.Helper()
	return seedGraphSession(t, suffix+"-"+uuid.NewString())
}

func graphTransportRequest(
	t *testing.T,
	body io.Reader,
	contentType string,
	session *http.Cookie,
) *http.Request {
	t.Helper()
	request := httptest.NewRequest(http.MethodPost, "/graphql", body)
	request.Host = "doindeksa.rs"
	request.Header.Set("Origin", "https://doindeksa.rs")
	if contentType != "" {
		request.Header.Set("Content-Type", contentType)
	}
	request.AddCookie(session)
	return request
}

func assertGraphTransportError(t *testing.T, response *http.Response, status int, code string) {
	t.Helper()
	if response.StatusCode != status {
		t.Fatalf("status = %d, want %d", response.StatusCode, status)
	}
	if contentType := response.Header.Get("Content-Type"); !strings.HasPrefix(contentType, "application/json") {
		t.Fatalf("content type = %q, want application/json", contentType)
	}
	var payload graphResponse
	if err := json.NewDecoder(response.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	requireGraphCode(t, payload, code)
}

type graphPanicReader struct{}

func (graphPanicReader) Read([]byte) (int, error) {
	panic("declared oversized GraphQL body was read")
}

type trackingGraphBody struct {
	io.Reader
	closed bool
}

func (body *trackingGraphBody) Close() error {
	body.closed = true
	return nil
}

type failingGraphBody struct {
	marker string
	closed bool
}

func (body *failingGraphBody) Read([]byte) (int, error) {
	return 0, errors.New(body.marker)
}

func (body *failingGraphBody) Close() error {
	body.closed = true
	return nil
}
