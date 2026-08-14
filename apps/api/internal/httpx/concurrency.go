package httpx

import "net/http"

const overloadRetryAfter = "1"

// LimitInFlight rejects application work above a fixed per-process budget.
func LimitInFlight(max int) func(http.Handler) http.Handler {
	if max <= 0 {
		panic("httpx: in-flight request limit must be positive")
	}

	slots := make(chan struct{}, max)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			select {
			case slots <- struct{}{}:
				defer func() { <-slots }()
				next.ServeHTTP(w, r)
			default:
				w.Header().Set("Retry-After", overloadRetryAfter)
				WriteError(w, http.StatusServiceUnavailable, "server_busy", "server is busy")
			}
		})
	}
}
