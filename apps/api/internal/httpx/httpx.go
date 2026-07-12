package httpx

import (
	"encoding/json"
	"net/http"

	"github.com/do-indeksa/platform/apps/api/internal/api"
)

func WriteJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func WriteError(w http.ResponseWriter, status int, code, message string) {
	WriteJSON(w, status, api.Error{Code: code, Message: message})
}
