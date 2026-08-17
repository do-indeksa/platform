package auth

import (
	"net/url"
	"path"
	"strings"
	"unicode"
	"unicode/utf8"
)

const maxReturnPathBytes = 2048

func sanitizeReturnPath(raw *string) string {
	if raw == nil {
		return "/"
	}
	normalized, ok := normalizeReturnPath(*raw)
	if !ok {
		return "/"
	}
	return normalized
}

func normalizeReturnPath(raw string) (string, bool) {
	if raw == "" || len(raw) > maxReturnPathBytes || !utf8.ValidString(raw) || raw[0] != '/' ||
		(len(raw) > 1 && (raw[1] == '/' || raw[1] == '\\')) {
		return "", false
	}
	pathEnd := len(raw)
	if index := strings.IndexAny(raw, "?#"); index >= 0 {
		pathEnd = index
	}
	if !validReturnPathEncoding(raw, pathEnd) {
		return "", false
	}

	parsed, err := url.Parse(raw)
	if err != nil || parsed.Scheme != "" || parsed.Host != "" || parsed.User != nil ||
		parsed.Opaque != "" || parsed.Path == "" || parsed.Path[0] != '/' ||
		strings.HasPrefix(parsed.Path, "//") || strings.ContainsRune(parsed.Path, '\\') {
		return "", false
	}

	trailingSlash := parsed.Path != "/" && strings.HasSuffix(parsed.Path, "/")
	parsed.Path = path.Clean(parsed.Path)
	if trailingSlash && parsed.Path != "/" {
		parsed.Path += "/"
	}
	parsed.RawPath = ""
	parsed.RawFragment = ""
	normalized := parsed.String()
	if len(normalized) > maxReturnPathBytes {
		return "", false
	}
	return normalized, true
}

func validReturnPathEncoding(raw string, pathEnd int) bool {
	decodedRaw, err := url.PathUnescape(raw)
	if err != nil || !utf8.ValidString(decodedRaw) {
		return false
	}
	for _, char := range decodedRaw {
		if char == '\\' || unicode.In(char, unicode.Cc, unicode.Cf) || unicode.IsSpace(char) {
			return false
		}
	}
	for index := 0; index < len(raw); index++ {
		char := raw[index]
		if char != '%' {
			continue
		}
		if index+2 >= len(raw) {
			return false
		}
		decoded, ok := decodeHexByte(raw[index+1], raw[index+2])
		if !ok || decoded == '\\' || decoded < ' ' || decoded == 0x7f ||
			(decoded == '/' && index < pathEnd) {
			return false
		}
		index += 2
	}
	return true
}

func decodeHexByte(high, low byte) (byte, bool) {
	highValue, highOK := hexValue(high)
	lowValue, lowOK := hexValue(low)
	return highValue<<4 | lowValue, highOK && lowOK
}

func hexValue(value byte) (byte, bool) {
	switch {
	case '0' <= value && value <= '9':
		return value - '0', true
	case 'a' <= value && value <= 'f':
		return value - 'a' + 10, true
	case 'A' <= value && value <= 'F':
		return value - 'A' + 10, true
	default:
		return 0, false
	}
}
