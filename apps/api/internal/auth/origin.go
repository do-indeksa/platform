package auth

import (
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/do-indeksa/platform/apps/api/internal/httpx"
)

// CookieMutationOriginMiddleware keeps host-only session cookies on the
// same-origin API surface that issued them. Requests without a session cookie
// retain their existing authentication and OAuth behavior.
func CookieMutationOriginMiddleware(service *Service) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if safeMethod(r.Method) || !hasSessionCookie(service, r) {
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

func hasSessionCookie(service *Service, r *http.Request) bool {
	_, err := service.requestSessionCookie(r)
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
	origin, ok := parseOrigin(raw)
	return origin.value, ok
}

type parsedOrigin struct {
	value    string
	scheme   string
	hostname string
	port     string
}

func parseOrigin(raw string) (parsedOrigin, bool) {
	if raw == "" || raw == "null" || strings.ContainsAny(raw, "\r\n?#") {
		return parsedOrigin{}, false
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.User != nil || parsed.Opaque != "" || parsed.Hostname() == "" ||
		parsed.ForceQuery || parsed.RawQuery != "" || parsed.Fragment != "" ||
		(parsed.EscapedPath() != "" && parsed.EscapedPath() != "/") {
		return parsedOrigin{}, false
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return parsedOrigin{}, false
	}

	hostname := strings.ToLower(parsed.Hostname())
	if !validHostname(hostname) {
		return parsedOrigin{}, false
	}
	port, ok := normalizePort(parsed.Port())
	if strings.HasSuffix(parsed.Host, ":") || !ok {
		return parsedOrigin{}, false
	}
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
	return parsedOrigin{
		value:    scheme + "://" + host,
		scheme:   scheme,
		hostname: hostname,
		port:     port,
	}, true
}

func validHostname(hostname string) bool {
	if ip := net.ParseIP(hostname); ip != nil {
		return true
	}
	if hostname == "" || len(hostname) > 253 {
		return false
	}
	for _, label := range strings.Split(hostname, ".") {
		if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, character := range label {
			if (character < 'a' || character > 'z') &&
				(character < '0' || character > '9') && character != '-' {
				return false
			}
		}
	}
	return true
}

func normalizePort(port string) (string, bool) {
	if port == "" {
		return "", true
	}
	value, err := strconv.Atoi(port)
	if err != nil || value <= 0 || value > 65535 {
		return "", false
	}
	return strconv.Itoa(value), true
}

func loopbackOrigin(origin parsedOrigin) bool {
	if origin.hostname == "localhost" {
		return true
	}
	ip := net.ParseIP(origin.hostname)
	return ip != nil && ip.IsLoopback()
}

func writeOriginError(w http.ResponseWriter) {
	httpx.WriteError(
		w,
		http.StatusForbidden,
		"cross_site_request",
		"session mutation requires a same-origin browser request",
	)
}
