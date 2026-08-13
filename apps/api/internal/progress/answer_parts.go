package progress

import (
	"encoding/json"
	"unicode/utf16"
)

const maxAnswerPartLength = 200

func parseAnswerParts(value *string, count int16) ([]string, bool) {
	if value == nil {
		return nil, false
	}
	var parts []string
	if err := json.Unmarshal([]byte(*value), &parts); err != nil || len(parts) != int(count) {
		return nil, false
	}
	if !validAnswerParts(parts, count) {
		return nil, false
	}
	return parts, true
}

func validAnswerParts(parts []string, count int16) bool {
	if len(parts) != int(count) {
		return false
	}
	for _, part := range parts {
		if len(utf16.Encode([]rune(part))) > maxAnswerPartLength {
			return false
		}
	}
	return true
}
