package graph

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"

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
		query, valid := validGraphQLRequestEnvelope(body)
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

func validGraphQLRequestEnvelope(body []byte) (string, bool) {
	decoder := json.NewDecoder(bytes.NewReader(body))
	opening, err := decoder.Token()
	if err != nil || opening != json.Delim('{') {
		return "", false
	}

	seen := make(map[string]struct{})
	var query string
	for decoder.More() {
		token, err := decoder.Token()
		field, ok := token.(string)
		if err != nil || !ok {
			return "", false
		}
		if _, duplicate := seen[field]; duplicate {
			return "", false
		}
		seen[field] = struct{}{}
		if canonical, protocol := canonicalGraphQLRequestField(field); protocol && field != canonical {
			return "", false
		}

		var raw json.RawMessage
		if err := decoder.Decode(&raw); err != nil {
			return "", false
		}
		switch field {
		case "query":
			var value *string
			if json.Unmarshal(raw, &value) != nil {
				return "", false
			}
			if value != nil {
				query = *value
			}
		case "operationName":
			var value *string
			if json.Unmarshal(raw, &value) != nil {
				return "", false
			}
		case "variables", "extensions":
			var value map[string]json.RawMessage
			if json.Unmarshal(raw, &value) != nil {
				return "", false
			}
		}
	}
	closing, err := decoder.Token()
	if err != nil || closing != json.Delim('}') {
		return "", false
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return "", false
	}
	return query, true
}

func canonicalGraphQLRequestField(field string) (string, bool) {
	for _, canonical := range [...]string{"query", "operationName", "variables", "extensions"} {
		if strings.EqualFold(field, canonical) {
			return canonical, true
		}
	}
	return "", false
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
