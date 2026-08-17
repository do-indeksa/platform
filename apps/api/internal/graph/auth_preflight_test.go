package graph

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGraphQLRejectsTransportAndProtocolInputBeforeSessionLookup(t *testing.T) {
	session := seedGraphTransportSession(t, "-preflight-session")
	oversizedDocument := paddedGraphQLDocument(
		t,
		"query { prepPreferences { version } }",
		maxGraphQLDocumentBytes+1,
	)
	complexityFields := make([]string, 25)
	for index := range complexityFields {
		complexityFields[index] = fmt.Sprintf("runs%d: runs(limit: 100) { id }", index)
	}
	overComplexDocument := "query {" + strings.Join(complexityFields, "\n") + "}"
	tests := []struct {
		name        string
		body        string
		contentType string
		status      int
		code        string
	}{
		{
			name:        "unsupported media type",
			body:        `{"query":"query { runs { id } }"}`,
			contentType: "text/plain",
			status:      http.StatusUnsupportedMediaType,
			code:        "UNSUPPORTED_MEDIA_TYPE",
		},
		{
			name:        "invalid JSON",
			body:        `{"query":`,
			contentType: "application/json",
			status:      http.StatusBadRequest,
			code:        "BAD_REQUEST",
		},
		{
			name:        "noncanonical envelope field",
			body:        `{"Query":"query { runs { id } }"}`,
			contentType: "application/json",
			status:      http.StatusBadRequest,
			code:        "BAD_REQUEST",
		},
		{
			name:        "oversized body",
			body:        strings.Repeat(" ", maxGraphQLBodyBytes+1),
			contentType: "application/json",
			status:      http.StatusRequestEntityTooLarge,
			code:        "PAYLOAD_TOO_LARGE",
		},
		{
			name:        "invalid GraphQL",
			body:        `{"query":"query {"}`,
			contentType: "application/json",
			status:      http.StatusUnprocessableEntity,
			code:        "GRAPHQL_PARSE_FAILED",
		},
		{
			name:        "oversized GraphQL document",
			body:        `{"query":` + quotedJSON(t, oversizedDocument) + `}`,
			contentType: "application/json",
			status:      http.StatusUnprocessableEntity,
			code:        "GRAPHQL_PARSE_FAILED",
		},
		{
			name:        "schema validation failure",
			body:        `{"query":"query { unknownField }"}`,
			contentType: "application/json",
			status:      http.StatusUnprocessableEntity,
			code:        "GRAPHQL_VALIDATION_FAILED",
		},
		{
			name:        "complexity limit",
			body:        `{"query":` + quotedJSON(t, overComplexDocument) + `}`,
			contentType: "application/json",
			status:      http.StatusOK,
			code:        "COMPLEXITY_LIMIT_EXCEEDED",
		},
		{
			name:        "multiple mutation commands",
			body:        `{"query":"mutation { first: abandonRun(input: {id: \"00000000-0000-0000-0000-000000000001\"}) { id } second: abandonRun(input: {id: \"00000000-0000-0000-0000-000000000002\"}) { id } }"}`,
			contentType: "application/json",
			status:      http.StatusUnprocessableEntity,
			code:        "GRAPHQL_VALIDATION_FAILED",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			before := graphTestPool.Stat().AcquireCount()
			request := graphTransportRequest(
				t,
				bytes.NewBufferString(tt.body),
				tt.contentType,
				session,
			)
			response := httptest.NewRecorder()

			graphApp.ServeHTTP(response, request)

			assertGraphTransportError(t, response.Result(), tt.status, tt.code)
			if after := graphTestPool.Stat().AcquireCount(); after != before {
				t.Fatalf("pool acquire count changed from %d to %d", before, after)
			}
		})
	}
}

func TestGraphQLResolvesSessionOnceForMultipleRootFields(t *testing.T) {
	session := seedGraphTransportSession(t, "-multi-root-session")
	before := graphTestPool.Stat().AcquireCount()

	_, payload := graphRequest(t, `query MultipleRootFields {
		runs(limit: 0) { id }
		attempts(limit: 0) { id }
	}`, nil, session)

	if len(payload.Errors) != 2 {
		t.Fatalf("errors = %+v, want two BAD_USER_INPUT errors", payload.Errors)
	}
	for _, graphError := range payload.Errors {
		if graphError.Extensions["code"] != "BAD_USER_INPUT" {
			t.Fatalf("unexpected GraphQL error: %+v", graphError)
		}
	}
	if after := graphTestPool.Stat().AcquireCount(); after != before+1 {
		t.Fatalf("pool acquire count = %d, want %d", after, before+1)
	}
}
