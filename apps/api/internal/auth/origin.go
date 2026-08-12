package auth

import (
	"net"
	"net/http"
	"net/url"
	"strings"

	"github.com/do-indeksa/platform/apps/api/internal/httpx"
)

// CookieMutationOriginMiddleware keeps host-only session cookies on the
// same-origin API surface that issued them. Requests without a session cookie
// retain their existing authentication and OAuth behavior.
func CookieMutationOriginMiddleware(service *Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if safeMethod(r.Method) || !hasSessionCookie(r) {
				next.ServeHTTP(w, r)
				return
			}

			w.Header().Add("Vary", "Origin")
			w.Header().Add("Vary", "Sec-Fetch-Site")
			if strings.EqualFold(r.Header.Get("Sec-Fetch-Site"), "cross-site") {
				writeOriginError(w)
				return
			}

			source, sourceOK := sourceOrigin(r)
			target, targetOK := normalizeOrigin(requestOrigin(r))
			if !sourceOK || !targetOK || source != target || !service.originAllowed(target) {
				writeOriginError(w)
				return
			}

			next.ServeHTTP(w, r)
		})
	}
}

func safeMethod(method string) bool {
	return method == http.MethodGet || method == http.MethodHead || method == http.MethodOptions
}

func hasSessionCookie(r *http.Request) bool {
	_, err := r.Cookie(SessionCookieName)
	return err == nil
}

func sourceOrigin(r *http.Request) (string, bool) {
	if origin := r.Header.Get("Origin"); origin != "" {
		return normalizeOrigin(origin)
	}
	rawReferrer := r.Header.Get("Referer")
	referrer, err := url.Parse(rawReferrer)
	if err != nil || strings.ContainsAny(rawReferrer, "\r\n") || referrer.User != nil ||
		referrer.Opaque != "" || referrer.Scheme == "" || referrer.Host == "" {
		return "", false
	}
	return normalizeOrigin(referrer.Scheme + "://" + referrer.Host)
}

func normalizeOrigin(raw string) (string, bool) {
	if raw == "" || raw == "null" || strings.ContainsAny(raw, "\r\n") {
		return "", false
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.User != nil || parsed.Opaque != "" || parsed.Hostname() == "" ||
		parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Path != "" && parsed.Path != "/") {
		return "", false
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return "", false
	}

	hostname := strings.ToLower(parsed.Hostname())
	port := parsed.Port()
	if (scheme == "http" && port == "80") || (scheme == "https" && port == "443") {
		port = ""
	}
	host := hostname
	if strings.Contains(hostname, ":") {
		host = "[" + hostname + "]"
	}
	if port != "" {
		host = net.JoinHostPort(hostname, port)
	}
	return scheme + "://" + host, true
}

func writeOriginError(w http.ResponseWriter) {
	httpx.WriteError(
		w,
		http.StatusForbidden,
		"cross_site_request",
		"session mutation requires a same-origin browser request",
	)
}
