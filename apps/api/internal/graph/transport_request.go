package graph

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"

	"github.com/99designs/gqlgen/graphql/errcode"
	"github.com/99designs/gqlgen/graphql/handler/transport"
)

func strictGraphQLRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			next.ServeHTTP(w, r)
			return
		}
		mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || mediaType != "application/json" {
			writeGraphQLTransportError(
				w,
				http.StatusUnsupportedMediaType,
				"UNSUPPORTED_MEDIA_TYPE",
				"content type must be application/json",
			)
			return
		}
		if r.ContentLength > maxGraphQLBodyBytes {
			writeGraphQLBodyTooLarge(w)
			return
		}

		boundedBody := http.MaxBytesReader(w, r.Body, maxGraphQLBodyBytes)
		body, err := io.ReadAll(boundedBody)
		_ = boundedBody.Close()
		if err != nil {
			var maxBytesError *http.MaxBytesError
			if errors.As(err, &maxBytesError) {
				writeGraphQLBodyTooLarge(w)
				return
			}
			writeGraphQLTransportError(w, http.StatusBadRequest, "BAD_REQUEST", "request body could not be read")
			return
		}
		decoder := json.NewDecoder(bytes.NewReader(body))
		var envelope map[string]json.RawMessage
		if err := decoder.Decode(&envelope); err != nil || envelope == nil {
			writeGraphQLTransportError(w, http.StatusBadRequest, "BAD_REQUEST", "body must contain one json object")
			return
		}
		if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
			writeGraphQLTransportError(w, http.StatusBadRequest, "BAD_REQUEST", "body must contain one json object")
			return
		}
		query, valid := validGraphQLRequestEnvelope(envelope)
		if !valid {
			writeGraphQLTransportError(w, http.StatusBadRequest, "BAD_REQUEST", "graphql request envelope is invalid")
			return
		}
		if len(query) > maxGraphQLDocumentBytes {
			writeGraphQLTransportError(
				w,
				http.StatusUnprocessableEntity,
				errcode.ParseFailed,
				"graphql document exceeds 16 KiB",
			)
			return
		}

		r.Body = io.NopCloser(bytes.NewReader(body))
		r.ContentLength = int64(len(body))
		next.ServeHTTP(w, r)
	})
}

func validGraphQLRequestEnvelope(envelope map[string]json.RawMessage) (string, bool) {
	var query *string
	if raw, exists := envelope["query"]; exists && json.Unmarshal(raw, &query) != nil {
		return "", false
	}
	if raw, exists := envelope["operationName"]; exists {
		var operationName *string
		if json.Unmarshal(raw, &operationName) != nil {
			return "", false
		}
	}
	for _, field := range []string{"variables", "extensions"} {
		raw, exists := envelope[field]
		if !exists {
			continue
		}
		var value map[string]json.RawMessage
		if json.Unmarshal(raw, &value) != nil {
			return "", false
		}
	}
	if query == nil {
		return "", true
	}
	return *query, true
}

func writeGraphQLBodyTooLarge(w http.ResponseWriter) {
	writeGraphQLTransportError(
		w,
		http.StatusRequestEntityTooLarge,
		"PAYLOAD_TOO_LARGE",
		"request body exceeds 256 KiB",
	)
}

func writeGraphQLTransportError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	transport.SendError(w, status, codedError(code, message))
}
