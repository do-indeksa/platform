package auth

import (
	"context"
	"errors"
	"strings"
	"testing"
)

func TestOAuthUserinfoClaimsAreValidatedBeforePersistence(t *testing.T) {
	tests := []struct {
		name        string
		info        userinfo
		wantInvalid bool
		wantName    string
		wantPicture string
	}{
		{
			name:        "missing subject",
			info:        userinfo{Email: "missing-sub@example.com"},
			wantInvalid: true,
		},
		{
			name:        "oversized subject",
			info:        userinfo{Sub: strings.Repeat("s", 256), Email: "oversized-sub@example.com"},
			wantInvalid: true,
		},
		{
			name:        "non-ASCII subject",
			info:        userinfo{Sub: "subject-č", Email: "non-ascii-sub@example.com"},
			wantInvalid: true,
		},
		{
			name:        "subject containing whitespace",
			info:        userinfo{Sub: "subject value", Email: "space-sub@example.com"},
			wantInvalid: true,
		},
		{
			name:        "malformed email",
			info:        userinfo{Sub: "malformed-email", Email: "not-an-email"},
			wantInvalid: true,
		},
		{
			name:        "oversized email",
			info:        userinfo{Sub: "oversized-email", Email: strings.Repeat("e", 317) + "@x.io"},
			wantInvalid: true,
		},
		{
			name:        "email containing control",
			info:        userinfo{Sub: "control-email", Email: "bad\nmail@example.com"},
			wantInvalid: true,
		},
		{
			name:     "blank display name falls back to email",
			info:     userinfo{Sub: "blank-name", Email: "blank-name@example.com", Name: " \t\n"},
			wantName: "blank-name@example.com",
		},
		{
			name:     "display name containing control falls back to email",
			info:     userinfo{Sub: "control-name", Email: "control-name@example.com", Name: "bad\x00name"},
			wantName: "control-name@example.com",
		},
		{
			name:     "oversized display name falls back to email",
			info:     userinfo{Sub: "oversized-name", Email: "oversized-name@example.com", Name: strings.Repeat("č", 257)},
			wantName: "oversized-name@example.com",
		},
		{
			name:     "unsupported picture is omitted",
			info:     userinfo{Sub: "foreign-picture", Email: "foreign-picture@example.com", Name: "Picture", Picture: "http://avatar.example/me.png"},
			wantName: "Picture",
		},
		{
			name:        "valid Unicode name and Google picture are preserved",
			info:        userinfo{Sub: strings.Repeat("s", 255), Email: "valid-profile@example.com", Name: "Đorđe Petrović", Picture: "https://lh3.googleusercontent.com/a/profile=s96-c"},
			wantName:    "Đorđe Petrović",
			wantPicture: "https://lh3.googleusercontent.com/a/profile=s96-c",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			google := newFakeGoogle(t, tt.info)
			service := newOAuthUpstreamTestService(google.server.URL)
			before := testPool.Stat().AcquireCount()
			user, err := service.CompleteGoogleSignIn(
				context.Background(),
				testAuthorizationCode,
				testCodeVerifier,
			)
			after := testPool.Stat().AcquireCount()

			if tt.wantInvalid {
				if !errors.Is(err, ErrInvalidUserinfo) {
					t.Fatalf("error = %v, want %v", err, ErrInvalidUserinfo)
				}
				if after != before {
					t.Fatalf("invalid claims acquired a database connection: before=%d after=%d", before, after)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			t.Cleanup(func() {
				_, _ = testPool.Exec(context.Background(), "delete from users where id = $1", user.ID)
			})
			if user.Name != tt.wantName {
				t.Fatalf("name = %q, want %q", user.Name, tt.wantName)
			}
			if tt.wantPicture == "" {
				if user.PictureUrl != nil {
					t.Fatalf("picture = %q, want omitted", *user.PictureUrl)
				}
			} else if user.PictureUrl == nil || *user.PictureUrl != tt.wantPicture {
				t.Fatalf("picture = %v, want %q", user.PictureUrl, tt.wantPicture)
			}
		})
	}
}

func TestGooglePictureClaimAllowlist(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  bool
	}{
		{name: "missing optional picture", want: true},
		{name: "Google image", value: "https://lh3.googleusercontent.com/a/profile=s96-c", want: true},
		{name: "Google image query", value: "https://lh3.googleusercontent.com/a/profile?sz=96", want: true},
		{name: "HTTP", value: "http://lh3.googleusercontent.com/a/profile"},
		{name: "apex host", value: "https://googleusercontent.com/a/profile"},
		{name: "foreign suffix", value: "https://lh3.googleusercontent.com.evil.example/a/profile"},
		{name: "credentials", value: "https://user@lh3.googleusercontent.com/a/profile"},
		{name: "explicit port", value: "https://lh3.googleusercontent.com:443/a/profile"},
		{name: "fragment", value: "https://lh3.googleusercontent.com/a/profile#fragment"},
		{name: "relative", value: "/a/profile"},
		{name: "oversized", value: "https://lh3.googleusercontent.com/" + strings.Repeat("p", maxUserPictureBytes)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := validGooglePicture(tt.value); got != tt.want {
				t.Fatalf("validGooglePicture(%q) = %v, want %v", tt.value, got, tt.want)
			}
		})
	}
}
