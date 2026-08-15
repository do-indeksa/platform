package auth

import (
	"bytes"
	"cmp"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"

	"golang.org/x/oauth2"
)

const (
	callbackPath           = "/api/v1/auth/google/callback"
	oauthUpstreamTimeout   = 10 * time.Second
	oauthHTTPClientTimeout = oauthUpstreamTimeout + time.Second
	maxUserinfoBodyBytes   = 64 << 10
	googleUserinfoURL      = "https://openidconnect.googleapis.com/v1/userinfo"
)

var googleEndpoint = oauth2.Endpoint{
	AuthURL:  "https://accounts.google.com/o/oauth2/v2/auth",
	TokenURL: "https://oauth2.googleapis.com/token",
}

var (
	ErrCodeRejected        = errors.New("authorization code rejected")
	ErrInvalidUserinfo     = errors.New("userinfo is missing sub or email")
	ErrProviderUnavailable = errors.New("oauth provider unavailable")
)

type userinfo struct {
	Sub     string `json:"sub"`
	Email   string `json:"email"`
	Name    string `json:"name"`
	Picture string `json:"picture"`
}

func newOAuthHTTPClient() *http.Client {
	return &http.Client{
		Timeout: oauthHTTPClientTimeout,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

func (s *Service) CompleteGoogleSignIn(ctx context.Context, code, verifier string) (User, error) {
	upstreamCtx, cancel := context.WithTimeout(ctx, s.upstreamTimeout)
	defer cancel()
	upstreamCtx = context.WithValue(upstreamCtx, oauth2.HTTPClient, s.upstreamClient)

	token, err := s.oauth().Exchange(upstreamCtx, code, oauth2.VerifierOption(verifier))
	if err != nil {
		var retrieveErr *oauth2.RetrieveError
		if errors.As(err, &retrieveErr) && retrieveErr.Response != nil &&
			retrieveErr.Response.StatusCode == http.StatusBadRequest &&
			retrieveErr.ErrorCode == "invalid_grant" {
			return User{}, ErrCodeRejected
		}
		return User{}, providerError("token exchange")
	}
	info, err := s.fetchUserinfo(upstreamCtx, token)
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

func (s *Service) oauth() *oauth2.Config {
	return &oauth2.Config{
		ClientID:     s.cfg.ClientID,
		ClientSecret: s.cfg.ClientSecret,
		Endpoint:     s.endpoint,
		RedirectURL:  s.cfg.CanonicalOrigin + callbackPath,
		Scopes:       []string{"openid", "email", "profile"},
	}
}

func (s *Service) fetchUserinfo(ctx context.Context, token *oauth2.Token) (userinfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, s.userinfoURL, nil)
	if err != nil {
		return userinfo{}, providerError("userinfo request")
	}
	resp, err := s.oauth().Client(ctx, token).Do(req)
	if err != nil {
		return userinfo{}, providerError("userinfo request")
	}
	defer func() { _ = resp.Body.Close() }()
	if resp.StatusCode != http.StatusOK {
		return userinfo{}, providerError("userinfo status")
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, maxUserinfoBodyBytes+1))
	if err != nil || len(body) > maxUserinfoBodyBytes {
		return userinfo{}, providerError("userinfo body")
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	var info userinfo
	if err := decoder.Decode(&info); err != nil {
		return userinfo{}, providerError("userinfo JSON")
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return userinfo{}, providerError("userinfo JSON framing")
	}
	if info.Sub == "" || info.Email == "" {
		return userinfo{}, ErrInvalidUserinfo
	}
	return info, nil
}

func providerError(stage string) error {
	return fmt.Errorf("%w: %s", ErrProviderUnavailable, stage)
}
