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
	for _, part := range parts {
		if len(utf16.Encode([]rune(part))) > maxAnswerPartLength {
			return nil, false
		}
	}
	return parts, true
}
