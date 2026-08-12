package auth

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"slices"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/oauth2"
)

var (
	errInvalidReturnPath = errors.New("invalid return path")
	ErrNoSession         = errors.New("no valid session")
)

const handoffCodeHashPurpose = "do-indeksa/oauth-handoff/browser-bound/v1"

type Config struct {
	ClientID            string
	ClientSecret        string
	Secret              []byte
	CanonicalOrigin     string
	ExtraOrigins        []string
	PreviewOriginSuffix string
}

type Service struct {
	cfg             Config
	queries         *Queries
	endpoint        oauth2.Endpoint
	userinfoURL     string
	upstreamClient  *http.Client
	upstreamTimeout time.Duration
}

func NewService(pool *pgxpool.Pool, cfg Config) *Service {
	return &Service{
		cfg:             cfg,
		queries:         New(pool),
		endpoint:        googleEndpoint,
		userinfoURL:     googleUserinfoURL,
		upstreamClient:  newOAuthHTTPClient(),
		upstreamTimeout: oauthUpstreamTimeout,
	}
}

func (s *Service) IssueSession(ctx context.Context, userID uuid.UUID) (string, error) {
	token, tokenHash, err := newSecret()
	if err != nil {
		return "", err
	}
	err = s.queries.CreateSession(ctx, CreateSessionParams{
		TokenHash: tokenHash,
		UserID:    userID,
		ExpiresAt: time.Now().Add(sessionTTL),
	})
	if err != nil {
		return "", err
	}
	return token, nil
}

func (s *Service) MintHandoffCode(
	ctx context.Context,
	userID uuid.UUID,
	origin string,
	redirect string,
	binding oauthBinding,
) (string, error) {
	origin, ok := s.allowedOrigin(origin)
	if !ok || origin == s.cfg.CanonicalOrigin {
		return "", errInvalidState
	}
	redirect, ok = normalizeReturnPath(redirect)
	if !ok {
		return "", errInvalidReturnPath
	}
	bindingHash, ok := decodeBindingHash(binding)
	if !ok {
		return "", errInvalidState
	}
	code, _, err := newSecret()
	if err != nil {
		return "", err
	}
	err = s.queries.CreateAuthCode(ctx, CreateAuthCodeParams{
		CodeHash:           hashHandoffCode(code),
		UserID:             userID,
		Origin:             &origin,
		Redirect:           redirect,
		BrowserBindingID:   &binding.ID,
		BrowserBindingHash: bindingHash,
		ExpiresAt:          time.Now().Add(codeTTL),
	})
	if err != nil {
		return "", err
	}
	return code, nil
}

func (s *Service) ExchangeHandoffCode(
	ctx context.Context,
	code string,
	origin string,
	bindingID string,
	bindingHash []byte,
) (ConsumeAuthCodeRow, error) {
	origin, ok := s.allowedOrigin(origin)
	if !ok || origin == s.cfg.CanonicalOrigin || !validSecret(code) ||
		!validBindingID(bindingID) ||
		len(bindingHash) != 32 {
		return ConsumeAuthCodeRow{}, pgx.ErrNoRows
	}
	row, err := s.queries.ConsumeAuthCode(ctx, ConsumeAuthCodeParams{
		CodeHash:           hashHandoffCode(code),
		Origin:             &origin,
		BrowserBindingID:   &bindingID,
		BrowserBindingHash: bindingHash,
	})
	if err != nil {
		return ConsumeAuthCodeRow{}, err
	}
	redirect, ok := normalizeReturnPath(row.Redirect)
	if !ok {
		return row, errInvalidReturnPath
	}
	row.Redirect = redirect
	return row, nil
}

func hashHandoffCode(code string) []byte {
	return hashSecret(handoffCodeHashPurpose + "\x00" + code)
}

func (s *Service) SessionUser(ctx context.Context, token string) (User, bool, error) {
	tokenHash := hashSecret(token)
	row, err := s.queries.GetSessionUser(ctx, tokenHash)
	if err != nil {
		return User{}, false, err
	}
	if time.Until(row.ExpiresAt) >= sessionTTL/2 {
		return row.User, false, nil
	}
	err = s.queries.ExtendSession(ctx, ExtendSessionParams{
		TokenHash: tokenHash,
		ExpiresAt: time.Now().Add(sessionTTL),
	})
	if err != nil {
		slog.Warn("session extension failed", "error", err)
		return row.User, false, nil
	}
	return row.User, true, nil
}

func (s *Service) RequestUser(r *http.Request) (User, error) {
	cookie, err := r.Cookie(SessionCookieName)
	if err != nil {
		return User{}, ErrNoSession
	}
	user, _, err := s.SessionUser(r.Context(), cookie.Value)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNoSession
	}
	return user, err
}

func (s *Service) Logout(ctx context.Context, token string) error {
	return s.queries.DeleteSession(ctx, hashSecret(token))
}

func (s *Service) CleanupExpired(ctx context.Context) error {
	if err := s.queries.DeleteExpiredSessions(ctx); err != nil {
		return err
	}
	return s.queries.DeleteExpiredAuthCodes(ctx)
}

func (s *Service) originAllowed(origin string) bool {
	_, ok := s.allowedOrigin(origin)
	return ok
}

func (s *Service) allowedOrigin(raw string) (string, bool) {
	origin, ok := parseOrigin(raw)
	if !ok || (origin.scheme != "https" && !loopbackOrigin(origin)) {
		return "", false
	}
	if origin.value == s.cfg.CanonicalOrigin || slices.Contains(s.cfg.ExtraOrigins, origin.value) {
		return origin.value, true
	}
	if origin.scheme == "https" && origin.port == "" &&
		previewHostnameMatches(origin.hostname, s.cfg.PreviewOriginSuffix) {
		return origin.value, true
	}
	return "", false
}

func (s *Service) secureCookies() bool {
	origin, ok := parseOrigin(s.cfg.CanonicalOrigin)
	return ok && origin.scheme == "https"
}
