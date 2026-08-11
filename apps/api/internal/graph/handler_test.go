package graph

import (
	"bytes"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGraphQLRequiresAuthentication(t *testing.T) {
	for _, query := range []string{
		`query { runs { id } }`,
		`query { attempts { id } }`,
	} {
		_, payload := graphRequest(t, query, nil, nil)
		requireGraphCode(t, payload, "UNAUTHENTICATED")
	}
}

func TestGraphQLRejectsInvalidProductInput(t *testing.T) {
	session := seedGraphSession(t, "")
	_, payload := graphRequest(t, `query($id: ID!) { run(id: $id) { id } }`, map[string]any{
		"id": "not-a-uuid",
	}, session)
	requireGraphCode(t, payload, "BAD_USER_INPUT")

	_, payload = graphRequest(t, `query { runs(limit: 101) { id } }`, nil, session)
	requireGraphCode(t, payload, "BAD_USER_INPUT")
	_, payload = graphRequest(t, `query { attempts(limit: 1001) { id } }`, nil, session)
	requireGraphCode(t, payload, "BAD_USER_INPUT")

	_, payload = graphRequest(t, `mutation($input: RecordAttemptInput!) {
    recordAttempt(input: $input) { id }
  }`, map[string]any{"input": map[string]any{"gradingKind": "HUMAN"}}, session)
	requireGraphCode(t, payload, "GRAPHQL_VALIDATION_FAILED")
}

func TestGraphQLTransportSurfaceIsBounded(t *testing.T) {
	session := seedGraphSession(t, "")

	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/graphql?query=%7Bruns%7Bid%7D%7D", nil)
	request.AddCookie(session)
	graphApp.ServeHTTP(recorder, request)
	if recorder.Code < 400 {
		t.Fatalf("GET returned status %d", recorder.Code)
	}

	recorder = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodPost, "/graphql", strings.NewReader(`{"query":"{ runs { id } }"}`))
	request.Header.Set("Content-Type", "text/plain")
	request.AddCookie(session)
	graphApp.ServeHTTP(recorder, request)
	if recorder.Code < 400 {
		t.Fatalf("non-JSON POST returned status %d", recorder.Code)
	}

	aliases := make([]string, 25)
	for i := range aliases {
		aliases[i] = fmt.Sprintf("r%d: runs(limit: 100) { id }", i)
	}
	_, payload := graphRequest(t, "query {"+strings.Join(aliases, "\n")+"}", nil, session)
	if len(payload.Errors) == 0 || !strings.Contains(strings.ToLower(payload.Errors[0].Message), "complexity") {
		t.Fatalf("complex query was accepted: %+v", payload)
	}

	_, payload = graphRequest(t, `query {
		attempts(limit: 1000) {
			id taskId examPosition mode startedAt submittedAt activeDurationMs answer
			outcome helpLevel gradingKind earnedPoints maxPoints taskRevision
		}
	}`, nil, session)
	if len(payload.Errors) == 0 || !strings.Contains(strings.ToLower(payload.Errors[0].Message), "complexity") {
		t.Fatalf("wide attempt journal was accepted: %+v", payload)
	}

	_, payload = graphRequest(t, `query { __schema { queryType { name } } }`, nil, session)
	if len(payload.Errors) == 0 {
		t.Fatal("introspection query was accepted")
	}

	oversized := bytes.Repeat([]byte(" "), maxGraphQLBodyBytes+1)
	recorder = httptest.NewRecorder()
	request = httptest.NewRequest(http.MethodPost, "/graphql", bytes.NewReader(oversized))
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(session)
	graphApp.ServeHTTP(recorder, request)
	if recorder.Code < 400 {
		t.Fatalf("oversized body returned status %d", recorder.Code)
	}
}
