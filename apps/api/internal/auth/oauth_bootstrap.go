package auth

import "time"

const (
	bootstrapPath                = "/api/v1/auth/google/bootstrap"
	bootstrapInitialPurpose      = "oauth-preview-initial-v1"
	bootstrapConfirmationPurpose = "oauth-preview-confirmation-v1"
	bootstrapContinuationPurpose = "oauth-preview-continuation-v1"
	bootstrapCancellationPurpose = "oauth-preview-cancellation-v1"
	bootstrapKeyPurpose          = "do-indeksa/oauth-bootstrap/browser-bound/v1"
	bootstrapTTL                 = 2 * time.Minute
)

type oauthBootstrap struct {
	Purpose         string        `json:"purpose"`
	Origin          string        `json:"origin"`
	Redirect        string        `json:"redirect"`
	CallbackBinding *oauthBinding `json:"callback_binding,omitempty"`
	HandoffBinding  oauthBinding  `json:"handoff_binding"`
	ExpiresAt       int64         `json:"exp"`
}

func sealOAuthBootstrap(key []byte, bootstrap oauthBootstrap) (string, error) {
	return sealOAuthToken(deriveOAuthKey(key, bootstrapKeyPurpose), bootstrap)
}

func openOAuthBootstrap(
	key []byte,
	token string,
	now time.Time,
) (oauthBootstrap, error) {
	var bootstrap oauthBootstrap
	if err := openOAuthToken(
		deriveOAuthKey(key, bootstrapKeyPurpose),
		token,
		&bootstrap,
	); err != nil {
		return oauthBootstrap{}, err
	}
	if now.Add(-oauthClockSkew).Unix() >= bootstrap.ExpiresAt ||
		bootstrap.ExpiresAt > now.Add(bootstrapTTL+oauthClockSkew).Unix() {
		return oauthBootstrap{}, errInvalidState
	}
	switch bootstrap.Purpose {
	case bootstrapInitialPurpose, bootstrapCancellationPurpose:
		if bootstrap.CallbackBinding != nil {
			return oauthBootstrap{}, errInvalidState
		}
	case bootstrapConfirmationPurpose, bootstrapContinuationPurpose:
		if bootstrap.CallbackBinding == nil {
			return oauthBootstrap{}, errInvalidState
		}
		if _, ok := decodeBindingHash(*bootstrap.CallbackBinding); !ok {
			return oauthBootstrap{}, errInvalidState
		}
	default:
		return oauthBootstrap{}, errInvalidState
	}
	if _, ok := decodeBindingHash(bootstrap.HandoffBinding); !ok {
		return oauthBootstrap{}, errInvalidState
	}
	return bootstrap, nil
}
