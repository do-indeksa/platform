package httpx

import "net/http"

const (
	apiContentSecurityPolicy = "default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none';"
	apiPermissionsPolicy     = "camera=(), display-capture=(), geolocation=(), microphone=(), payment=(), usb=()"
)

// SecurityHeaders applies a deny-by-default browser policy to every API response.
func SecurityHeaders(hsts bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			headers := w.Header()
			headers.Set("Content-Security-Policy", apiContentSecurityPolicy)
			headers.Set("Cross-Origin-Resource-Policy", "same-origin")
			headers.Set("Permissions-Policy", apiPermissionsPolicy)
			headers.Set("Referrer-Policy", "no-referrer")
			headers.Set("X-Content-Type-Options", "nosniff")
			headers.Set("X-Frame-Options", "DENY")
			headers.Set("X-Permitted-Cross-Domain-Policies", "none")
			if hsts {
				headers.Set("Strict-Transport-Security", "max-age=31536000")
			}
			next.ServeHTTP(w, r)
		})
	}
}
