package graph

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGraphQLRejectsAmbiguousEnvelopeFieldsBeforeMutation(t *testing.T) {
	marker := "private-ambiguous-envelope-marker"
	variables := `{"input":{"expectedVersion":0,"goalPoints":42,"examDate":"2028-02-29"}}`
	tests := []struct {
		name string
		body string
	}{
		{
			name: "oversized query case alias",
			body: `{"Query":` + quotedJSON(t, paddedGraphQLDocument(
				t,
				savePrepPreferencesMutation,
				maxGraphQLDocumentBytes+1,
			)) + `,"variables":` + variables + `}`,
		},
		{
			name: "query case alias",
			body: `{"Query":` + quotedJSON(t, savePrepPreferencesMutation) +
				`,"variables":` + variables + `}`,
		},
		{
			name: "variables case alias",
			body: `{"query":` + quotedJSON(t, savePrepPreferencesMutation) +
				`,"Variables":` + variables + `}`,
		},
		{
			name: "operation name case alias",
			body: `{"query":` + quotedJSON(t,
				`query Read { prepPreferences { version } } `+savePrepPreferencesMutation) +
				`,"OperationName":"SavePrepPreferences","variables":` + variables + `}`,
		},
		{
			name: "extensions case alias",
			body: `{"query":` + quotedJSON(t, savePrepPreferencesMutation) +
				`,"variables":` + variables + `,"Extensions":{}}`,
		},
		{
			name: "duplicate query",
			body: `{"query":"query Read { prepPreferences { version } }","query":` +
				quotedJSON(t, savePrepPreferencesMutation) + `,"variables":` + variables + `}`,
		},
		{
			name: "duplicate unknown field",
			body: `{"query":` + quotedJSON(t, savePrepPreferencesMutation) +
				`,"variables":` + variables + `,"futureField":1,"futureField":2}`,
		},
		{
			name: "invalid first duplicate",
			body: `{"query":{"marker":"` + marker + `"},"query":` +
				quotedJSON(t, savePrepPreferencesMutation) + `,"variables":` + variables + `}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			session := seedGraphTransportSession(t, "-ambiguous-envelope")
			request := graphTransportRequest(
				t,
				strings.NewReader(tt.body),
				"application/json",
				session,
			)
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

func quotedJSON(t *testing.T, value string) string {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatal(err)
	}
	return string(encoded)
}
