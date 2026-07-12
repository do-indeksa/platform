package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/oauth2"
)

const callbackPath = "/api/v1/auth/google/callback"

var googleEndpoint = oauth2.Endpoint{
	AuthURL:  "https://accounts.google.com/o/oauth2/v2/auth",
	TokenURL: "https://oauth2.googleapis.com/token",
}

const googleUserinfoURL = "https://openidconnect.googleapis.com/v1/userinfo"

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

func (s *Service) CleanupExpiredSessions(ctx context.Context) error {
	return s.queries.DeleteExpiredSessions(ctx)
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
	return info, nil
}
