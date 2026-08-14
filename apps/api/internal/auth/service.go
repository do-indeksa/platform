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

	"github.com/do-indeksa/platform/apps/api/internal/dbx"
	"github.com/do-indeksa/platform/apps/api/internal/safelog"
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
	pool            *pgxpool.Pool
	queries         *Queries
	endpoint        oauth2.Endpoint
	userinfoURL     string
	upstreamClient  *http.Client
	upstreamTimeout time.Duration
}

func NewService(pool *pgxpool.Pool, cfg Config) *Service {
	return &Service{
		cfg:             cfg,
		pool:            pool,
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
) (HandoffExchange, error) {
	origin, ok := s.allowedOrigin(origin)
	if !ok || origin == s.cfg.CanonicalOrigin || !validSecret(code) ||
		!validBindingID(bindingID) ||
		len(bindingHash) != 32 {
		return HandoffExchange{}, pgx.ErrNoRows
	}
	token, tokenHash, err := newSecret()
	if err != nil {
		return HandoffExchange{}, err
	}
	return s.exchangeHandoffCode(ctx, ConsumeAuthCodeParams{
		CodeHash:           hashHandoffCode(code),
		Origin:             &origin,
		BrowserBindingID:   &bindingID,
		BrowserBindingHash: bindingHash,
	}, token, tokenHash)
}

type HandoffExchange struct {
	SessionToken string
	Redirect     string
}

func (s *Service) exchangeHandoffCode(
	ctx context.Context,
	params ConsumeAuthCodeParams,
	token string,
	tokenHash []byte,
) (HandoffExchange, error) {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return HandoffExchange{}, err
	}
	defer func() { _ = dbx.Rollback(ctx, tx) }()

	queries := s.queries.WithTx(tx)
	row, err := queries.ConsumeAuthCode(ctx, params)
	if err != nil {
		return HandoffExchange{}, err
	}
	redirect, ok := normalizeReturnPath(row.Redirect)
	if !ok {
		if err := tx.Commit(ctx); err != nil {
			return HandoffExchange{}, err
		}
		return HandoffExchange{}, errInvalidReturnPath
	}
	if err := queries.CreateSession(ctx, CreateSessionParams{
		TokenHash: tokenHash,
		UserID:    row.UserID,
		ExpiresAt: time.Now().Add(sessionTTL),
	}); err != nil {
		return HandoffExchange{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return HandoffExchange{}, err
	}
	return HandoffExchange{SessionToken: token, Redirect: redirect}, nil
}

func hashHandoffCode(code string) []byte {
	return hashSecret(handoffCodeHashPurpose + "\x00" + code)
}

func (s *Service) SessionUser(ctx context.Context, token string) (User, bool, error) {
	tokenHash, ok := sessionTokenHash(token)
	if !ok {
		return User{}, false, pgx.ErrNoRows
	}
	row, err := s.queries.GetSessionUser(ctx, tokenHash)
	if err != nil {
		return User{}, false, err
	}
	if time.Until(row.ExpiresAt) >= sessionTTL/2 {
		return row.User, false, nil
	}
	updated, err := s.queries.ExtendSession(ctx, ExtendSessionParams{
		TokenHash: tokenHash,
		ExpiresAt: time.Now().Add(sessionTTL),
	})
	if err != nil {
		slog.Warn("session extension failed", safelog.Error(err))
		return row.User, false, nil
	}
	if updated != 1 {
		return row.User, false, nil
	}
	return row.User, true, nil
}

func (s *Service) RequestUser(r *http.Request) (User, *http.Cookie, error) {
	cookie, err := s.requestSessionCookie(r)
	if err != nil {
		return User{}, nil, ErrNoSession
	}
	user, refreshed, err := s.SessionUser(r.Context(), cookie.Value)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, nil, ErrNoSession
	}
	if err != nil {
		return User{}, nil, err
	}
	if !refreshed {
		return user, nil, nil
	}
	return user, s.sessionCookie(cookie.Value, int(sessionTTL.Seconds())), nil
}

func (s *Service) Logout(ctx context.Context, token string) error {
	tokenHash, ok := sessionTokenHash(token)
	if !ok {
		return nil
	}
	return s.queries.DeleteSession(ctx, tokenHash)
}

func (s *Service) DeleteAccount(ctx context.Context, token string) (bool, error) {
	tokenHash, ok := sessionTokenHash(token)
	if !ok {
		return false, nil
	}
	deleted, err := s.queries.DeleteAccountBySession(ctx, tokenHash)
	return deleted == 1, err
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
