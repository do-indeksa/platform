package graph

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGraphQLDocumentByteBoundary(t *testing.T) {
	tests := []struct {
		name       string
		queryBytes int
		wantStatus int
		wantCode   string
		wantWrite  bool
	}{
		{
			name:       "exact limit",
			queryBytes: maxGraphQLDocumentBytes,
			wantStatus: http.StatusOK,
			wantWrite:  true,
		},
		{
			name:       "one byte over",
			queryBytes: maxGraphQLDocumentBytes + 1,
			wantStatus: http.StatusUnprocessableEntity,
			wantCode:   "GRAPHQL_PARSE_FAILED",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			session := seedGraphTransportSession(t, "-document-byte-boundary")
			query := paddedGraphQLDocument(t, savePrepPreferencesMutation, tt.queryBytes)
			body := graphEnvelope(t, query, map[string]any{
				"input": prepPreferencesInput(0, 42, "2028-02-29"),
			})
			request := graphTransportRequest(t, bytes.NewReader(body), "application/json", session)
			response := httptest.NewRecorder()

			graphApp.ServeHTTP(response, request)

			if tt.wantWrite {
				if response.Code != tt.wantStatus {
					t.Fatalf("mutation returned %d: %s", response.Code, response.Body.String())
				}
				assertGraphPrepPreferences(t, session, &prepPreferencesPayload{
					GoalPoints: 42,
					ExamDate:   "2028-02-29",
					Version:    1,
				})
				return
			}
			assertGraphTransportError(t, response.Result(), tt.wantStatus, tt.wantCode)
			assertGraphPrepPreferences(t, session, nil)
		})
	}
}

func TestGraphQLDocumentTokenLimitRejectsBeforeMutation(t *testing.T) {
	session := seedGraphTransportSession(t, "-document-token-limit")
	query := savePrepPreferencesMutation + "\nquery Padding {" +
		strings.Repeat("...F", maxGraphQLDocumentTokens/2+100) +
		"}\nfragment F on Query { __typename }"
	if len(query) > maxGraphQLDocumentBytes {
		t.Fatalf("token-limit query = %d bytes, want at most %d", len(query), maxGraphQLDocumentBytes)
	}
	body := graphEnvelope(t, query, map[string]any{
		"input": prepPreferencesInput(0, 42, "2028-02-29"),
	})
	request := graphTransportRequest(t, bytes.NewReader(body), "application/json", session)
	response := httptest.NewRecorder()

	graphApp.ServeHTTP(response, request)

	assertGraphTransportError(
		t,
		response.Result(),
		http.StatusUnprocessableEntity,
		"GRAPHQL_PARSE_FAILED",
	)
	assertGraphPrepPreferences(t, session, nil)
}

func paddedGraphQLDocument(t *testing.T, query string, size int) string {
	t.Helper()
	if len(query) > size-2 {
		t.Fatalf("query has %d bytes, cannot pad to %d", len(query), size)
	}
	return query + "\n#" + strings.Repeat("x", size-len(query)-2)
}

func graphEnvelope(t *testing.T, query string, variables map[string]any) []byte {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"operationName": "SavePrepPreferences",
		"query":         query,
		"variables":     variables,
	})
	if err != nil {
		t.Fatal(err)
	}
	return body
}
