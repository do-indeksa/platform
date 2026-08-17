package auth

import (
	"strings"
	"testing"
)

func TestSanitizeReturnPath(t *testing.T) {
	path := func(value string) *string { return &value }
	tests := []struct {
		name  string
		input *string
		want  string
	}{
		{name: "missing", want: "/"},
		{name: "root", input: path("/"), want: "/"},
		{name: "app path", input: path("/ru/tasks/algebra"), want: "/ru/tasks/algebra"},
		{
			name:  "query and fragment",
			input: path("/ru/tasks/algebra?tab=practice#task-2"),
			want:  "/ru/tasks/algebra?tab=practice#task-2",
		},
		{name: "encoded query slash", input: path("/search?next=%2Fprep"), want: "/search?next=%2Fprep"},
		{name: "unicode path", input: path("/sr/račun"), want: "/sr/ra%C4%8Dun"},
		{name: "dot segments", input: path("/tasks/../prep/"), want: "/prep/"},
		{name: "encoded dot segments", input: path("/tasks/%2e%2e/prep"), want: "/prep"},
		{name: "empty query", input: path("/prep?"), want: "/prep?"},
		{name: "empty", input: path(""), want: "/"},
		{name: "relative", input: path("prep"), want: "/"},
		{name: "absolute URL", input: path("https://evil.example"), want: "/"},
		{name: "network path", input: path("//evil.example"), want: "/"},
		{name: "three leading slashes", input: path("///evil.example"), want: "/"},
		{name: "WHATWG backslash authority", input: path(`/\evil.example`), want: "/"},
		{name: "path backslash", input: path(`/tasks\evil.example`), want: "/"},
		{name: "encoded backslash", input: path("/%5cevil.example"), want: "/"},
		{name: "encoded path slash", input: path("/tasks%2Fprivate"), want: "/"},
		{name: "encoded leading slashes", input: path("/%2f%2fevil.example"), want: "/"},
		{name: "malformed escape", input: path("/tasks/%zz"), want: "/"},
		{name: "tab", input: path("/\tevil.example"), want: "/"},
		{name: "newline", input: path("/\nevil.example"), want: "/"},
		{name: "space", input: path("/evil example"), want: "/"},
		{name: "encoded carriage return", input: path("/%0devil.example"), want: "/"},
		{name: "invalid encoded UTF-8", input: path("/%ff"), want: "/"},
		{name: "encoded C1 control", input: path("/%c2%85evil.example"), want: "/"},
		{name: "unicode space", input: path("/evil\u00a0example"), want: "/"},
		{name: "bidi formatting control", input: path("/evil\u202aexample"), want: "/"},
		{name: "zero width formatting control", input: path("/evil\u200bexample"), want: "/"},
		{name: "encoded formatting control", input: path("/evil%e2%80%aaexample"), want: "/"},
		{name: "encoded query backslash", input: path("/prep?next=%5cevil.example"), want: "/"},
		{name: "too long", input: path("/" + strings.Repeat("a", maxReturnPathBytes)), want: "/"},
		{name: "canonical form too long", input: path("/" + strings.Repeat("č", 700)), want: "/"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sanitizeReturnPath(tt.input); got != tt.want {
				t.Fatalf("sanitizeReturnPath(%q) = %q, want %q", valueOrEmpty(tt.input), got, tt.want)
			}
		})
	}
}

func FuzzNormalizeReturnPath(f *testing.F) {
	for _, seed := range []string{
		"/",
		"/sr/tasks?tab=practice#task-2",
		"//evil.example",
		`/\evil.example`,
		"/%2f%2fevil.example",
		"/tasks/../prep/",
	} {
		f.Add(seed)
	}
	f.Fuzz(func(t *testing.T, raw string) {
		normalized, ok := normalizeReturnPath(raw)
		if !ok {
			return
		}
		if len(normalized) > maxReturnPathBytes || normalized == "" || normalized[0] != '/' ||
			(len(normalized) > 1 && (normalized[1] == '/' || normalized[1] == '\\')) ||
			strings.ContainsRune(normalized, '\\') {
			t.Fatalf("unsafe normalized return path %q from %q", normalized, raw)
		}
		second, secondOK := normalizeReturnPath(normalized)
		if !secondOK || second != normalized {
			t.Fatalf("normalization is not idempotent: %q -> %q -> %q, %v", raw, normalized, second, secondOK)
		}
	})
}

func TestNormalizeReturnPathRejectsAmbiguousBrowserReferences(t *testing.T) {
	for _, raw := range []string{
		`/\evil.example`,
		`/%5Cevil.example`,
		`/%2Fevil.example`,
		"/\revil.example",
	} {
		t.Run(raw, func(t *testing.T) {
			if normalized, ok := normalizeReturnPath(raw); ok {
				t.Fatalf("normalizeReturnPath(%q) = %q, true; want rejection", raw, normalized)
			}
		})
	}
}

func valueOrEmpty(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
