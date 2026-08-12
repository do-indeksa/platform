package auth

import (
	"errors"
	"fmt"
	"strings"
)

func ValidateConfig(cfg Config) error {
	canonical, err := validateConfiguredOrigin("CANONICAL_WEB_ORIGIN", cfg.CanonicalOrigin)
	if err != nil {
		return err
	}
	seen := map[string]string{canonical.value: "CANONICAL_WEB_ORIGIN"}
	for index, raw := range cfg.ExtraOrigins {
		name := fmt.Sprintf("EXTRA_WEB_ORIGINS[%d]", index)
		origin, err := validateConfiguredOrigin(name, raw)
		if err != nil {
			return err
		}
		if previous, exists := seen[origin.value]; exists {
			return fmt.Errorf("%s duplicates %s", name, previous)
		}
		seen[origin.value] = name
	}
	if err := validatePreviewOriginSuffix(cfg.PreviewOriginSuffix); err != nil {
		return err
	}
	if cfg.PreviewOriginSuffix != "" && previewHostnameMatches(canonical.hostname, cfg.PreviewOriginSuffix) {
		return errors.New("PREVIEW_ORIGIN_SUFFIX must not match CANONICAL_WEB_ORIGIN")
	}
	return nil
}

func validateConfiguredOrigin(name, raw string) (parsedOrigin, error) {
	origin, ok := parseOrigin(raw)
	if !ok {
		return parsedOrigin{}, fmt.Errorf("%s must be an HTTP origin without credentials, path, query or fragment", name)
	}
	if origin.value != raw {
		return parsedOrigin{}, fmt.Errorf("%s must use canonical lowercase form without a trailing slash or default port", name)
	}
	if origin.scheme != "https" && !loopbackOrigin(origin) {
		return parsedOrigin{}, fmt.Errorf("%s must use HTTPS unless it targets a loopback host", name)
	}
	return origin, nil
}

func validatePreviewOriginSuffix(suffix string) error {
	if suffix == "" {
		return nil
	}
	if suffix != strings.ToLower(suffix) || strings.TrimSpace(suffix) != suffix ||
		suffix[0] != '-' || strings.Count(suffix, ".") < 2 ||
		!validHostname("preview"+suffix) {
		return errors.New("PREVIEW_ORIGIN_SUFFIX must be a canonical, scoped hostname suffix beginning with '-'")
	}
	return nil
}

func previewHostnameMatches(hostname, suffix string) bool {
	return suffix != "" && len(hostname) > len(suffix) && strings.HasSuffix(hostname, suffix)
}
