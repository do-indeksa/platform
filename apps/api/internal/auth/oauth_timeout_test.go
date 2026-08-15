package auth

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestOAuthUpstreamTimeoutCancelsStalledRequests(t *testing.T) {
	for _, stalledOperation := range []string{"token", "userinfo"} {
		t.Run(stalledOperation, func(t *testing.T) {
			started := make(chan struct{})
			cancelled := make(chan struct{})
			stall := func(r *http.Request) {
				close(started)
				select {
				case <-r.Context().Done():
					close(cancelled)
				case <-time.After(2 * time.Second):
				}
			}
			mux := http.NewServeMux()
			mux.HandleFunc("POST /token", func(w http.ResponseWriter, r *http.Request) {
				if stalledOperation == "token" {
					_, _ = io.Copy(io.Discard, r.Body)
					_ = r.Body.Close()
					stall(r)
					return
				}
				writeTestToken(w)
			})
			mux.HandleFunc("GET /userinfo", func(_ http.ResponseWriter, r *http.Request) {
				stall(r)
			})
			server := httptest.NewServer(mux)
			t.Cleanup(server.Close)
			service := newOAuthUpstreamTestService(server.URL)
			service.upstreamTimeout = 50 * time.Millisecond
			service.upstreamClient.Timeout = time.Second

			startedAt := time.Now()
			_, err := service.CompleteGoogleSignIn(
				context.Background(),
				testAuthorizationCode,
				testCodeVerifier,
			)
			elapsed := time.Since(startedAt)

			assertOAuthErrorSanitized(t, err, ErrProviderUnavailable, testAuthorizationCode, testCodeVerifier, testAccessToken)
			if elapsed > time.Second {
				t.Fatalf("stalled %s call returned after %v", stalledOperation, elapsed)
			}
			select {
			case <-started:
			default:
				t.Fatalf("%s request was not started", stalledOperation)
			}
			select {
			case <-cancelled:
			case <-time.After(time.Second):
				t.Fatalf("stalled %s request was not cancelled", stalledOperation)
			}
		})
	}
}

func TestOAuthUpstreamHonorsRequestCancellation(t *testing.T) {
	started := make(chan struct{})
	cancelled := make(chan struct{})
	mux := http.NewServeMux()
	mux.HandleFunc("POST /token", func(_ http.ResponseWriter, r *http.Request) {
		_, _ = io.Copy(io.Discard, r.Body)
		_ = r.Body.Close()
		close(started)
		<-r.Context().Done()
		close(cancelled)
	})
	server := httptest.NewServer(mux)
	t.Cleanup(server.Close)
	service := newOAuthUpstreamTestService(server.URL)
	ctx, cancel := context.WithCancel(context.Background())
	result := make(chan error, 1)
	go func() {
		_, err := service.CompleteGoogleSignIn(ctx, testAuthorizationCode, testCodeVerifier)
		result <- err
	}()
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("token request was not started")
	}
	cancel()

	select {
	case err := <-result:
		assertOAuthErrorSanitized(t, err, ErrProviderUnavailable, testAuthorizationCode, testCodeVerifier)
	case <-time.After(time.Second):
		t.Fatal("OAuth call did not return after request cancellation")
	}
	select {
	case <-cancelled:
	case <-time.After(time.Second):
		t.Fatal("token request did not observe cancellation")
	}
}

func TestOAuthSequenceUsesOneDeadlineAndOneClient(t *testing.T) {
	var tokenDeadline time.Time
	var userinfoDeadline time.Time
	transport := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		deadline, ok := r.Context().Deadline()
		if !ok {
			return nil, errors.New("request has no deadline")
		}
		switch r.URL.Path {
		case "/token":
			tokenDeadline = deadline
			if r.Body != nil {
				_ = r.Body.Close()
			}
			time.Sleep(25 * time.Millisecond)
			return testHTTPResponse(
				r,
				http.StatusOK,
				http.Header{"Content-Type": {"application/json"}},
				io.NopCloser(strings.NewReader(`{"access_token":"`+testAccessToken+`","token_type":"Bearer","expires_in":3600}`)),
			), nil
		case "/userinfo":
			userinfoDeadline = deadline
			<-r.Context().Done()
			return nil, r.Context().Err()
		default:
			return nil, fmt.Errorf("unexpected path %s", r.URL.Path)
		}
	})
	service := newOAuthUpstreamTestService("https://provider.example")
	service.upstreamTimeout = 75 * time.Millisecond
	service.upstreamClient = &http.Client{Transport: transport, Timeout: time.Second}

	startedAt := time.Now()
	_, err := service.CompleteGoogleSignIn(context.Background(), testAuthorizationCode, testCodeVerifier)
	elapsed := time.Since(startedAt)

	assertOAuthErrorSanitized(t, err, ErrProviderUnavailable, testAuthorizationCode, testCodeVerifier, testAccessToken)
	if tokenDeadline.IsZero() || userinfoDeadline.IsZero() {
		t.Fatalf("deadlines were not observed: token=%v userinfo=%v", tokenDeadline, userinfoDeadline)
	}
	if !tokenDeadline.Equal(userinfoDeadline) {
		t.Fatalf("token and userinfo used different deadlines: %v != %v", tokenDeadline, userinfoDeadline)
	}
	if elapsed > time.Second {
		t.Fatalf("OAuth sequence returned after %v", elapsed)
	}
}
