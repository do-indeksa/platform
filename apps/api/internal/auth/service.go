package auth

import (
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"slices"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/oauth2"
)

const callbackPath = "/api/v1/auth/google/callback"

var googleEndpoint = oauth2.Endpoint{
	AuthURL:  "https://accounts.google.com/o/oauth2/v2/auth",
	TokenURL: "https://oauth2.googleapis.com/token",
}

const googleUserinfoURL = "https://openidconnect.googleapis.com/v1/userinfo"

var (
	ErrCodeRejected    = errors.New("authorization code rejected")
	ErrInvalidUserinfo = errors.New("userinfo is missing sub or email")
	ErrNoSession       = errors.New("no valid session")
)

type Config struct {
	ClientID            string
	ClientSecret        string
	Secret              []byte
	CanonicalOrigin     string
	ExtraOrigins        []string
	PreviewOriginSuffix string
}

type Service struct {
	cfg         Config
	queries     *Queries
	endpoint    oauth2.Endpoint
	userinfoURL string
}

func NewService(pool *pgxpool.Pool, cfg Config) *Service {
	return &Service{
		cfg:         cfg,
		queries:     New(pool),
		endpoint:    googleEndpoint,
		userinfoURL: googleUserinfoURL,
	}
}

func (s *Service) CompleteGoogleSignIn(ctx context.Context, code, verifier string) (User, error) {
	token, err := s.oauth().Exchange(ctx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		var retrieveErr *oauth2.RetrieveError
		if errors.As(err, &retrieveErr) && retrieveErr.Response.StatusCode == http.StatusBadRequest {
			return User{}, fmt.Errorf("%w: %v", ErrCodeRejected, err)
		}
		return User{}, err
	}
	info, err := s.fetchUserinfo(ctx, token)
	if err != nil {
		return User{}, err
	}
	var picture *string
	if info.Picture != "" {
		picture = &info.Picture
	}
	return s.queries.UpsertUser(ctx, UpsertUserParams{
		GoogleSub:  info.Sub,
		Email:      info.Email,
		Name:       cmp.Or(info.Name, info.Email),
		PictureUrl: picture,
	})
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

func (s *Service) MintHandoffCode(ctx context.Context, userID uuid.UUID, redirect string) (string, error) {
	code, codeHash, err := newSecret()
	if err != nil {
		return "", err
	}
	err = s.queries.CreateAuthCode(ctx, CreateAuthCodeParams{
		CodeHash:  codeHash,
		UserID:    userID,
		Redirect:  redirect,
		ExpiresAt: time.Now().Add(codeTTL),
	})
	if err != nil {
		return "", err
	}
	return code, nil
}

func (s *Service) ExchangeHandoffCode(ctx context.Context, code string) (ConsumeAuthCodeRow, error) {
	return s.queries.ConsumeAuthCode(ctx, hashSecret(code))
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

func (s *Service) oauth() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     s.cfg.ClientID,
		ClientSecret: s.cfg.ClientSecret,
		Endpoint:     s.endpoint,
		RedirectURL:  s.cfg.CanonicalOrigin + callbackPath,
		Scopes:       []string{"openid", "email", "profile"},
	}
}

func (s *Service) originAllowed(origin string) bool {
	if origin == s.cfg.CanonicalOrigin || slices.Contains(s.cfg.ExtraOrigins, origin) {
		return true
	}
	return s.cfg.PreviewOriginSuffix != "" &&
		strings.HasPrefix(origin, "https://") &&
		strings.HasSuffix(origin, s.cfg.PreviewOriginSuffix)
}

func (s *Service) secureCookies() bool {
	return strings.HasPrefix(s.cfg.CanonicalOrigin, "https://")
}

type userinfo struct {
	Sub     string `json:"sub"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

func (s *Service) fetchUserinfo(ctx context.Context, token *oauth2.Token) (userinfo, error) {
	resp, err := s.oauth().Client(ctx, token).Get(s.userinfoURL)
	if err != nil {
		return userinfo{}, err
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return userinfo{}, fmt.Errorf("userinfo status %d", resp.StatusCode)
	}
	var info userinfo
	if err := json.NewDecoder(resp.Body).Decode(&info); err != nil {
		return userinfo{}, err
	}
	if info.Sub == "" || info.Email == "" {
		return userinfo{}, ErrInvalidUserinfo
	}
	return info, nil
}
