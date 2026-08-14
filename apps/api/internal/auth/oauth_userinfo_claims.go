package auth

import (
	"net/mail"
	"net/url"
	"strings"
	"unicode"
	"unicode/utf8"
)

const (
	maxGoogleSubjectBytes = 255
	maxUserEmailBytes     = 320
	maxUserNameRunes      = 256
	maxUserPictureBytes   = 2048
)

func normalizeUserinfo(info userinfo) (userinfo, bool) {
	if !validGoogleSubject(info.Sub) || !validUserEmail(info.Email) {
		return userinfo{}, false
	}

	info.Name = strings.TrimSpace(info.Name)
	if !validUserName(info.Name) {
		info.Name = info.Email
	}
	if !validGooglePicture(info.Picture) {
		info.Picture = ""
	}
	return info, true
}

func validGoogleSubject(value string) bool {
	if len(value) == 0 || len(value) > maxGoogleSubjectBytes {
		return false
	}
	for index := range len(value) {
		if value[index] < '!' || value[index] > '~' {
			return false
		}
	}
	return true
}

func validUserEmail(value string) bool {
	if len(value) < 3 || len(value) > maxUserEmailBytes ||
		!utf8.ValidString(value) || strings.TrimSpace(value) != value ||
		strings.IndexFunc(value, unicode.IsControl) >= 0 {
		return false
	}
	address, err := mail.ParseAddress(value)
	return err == nil && address.Address == value
}

func validUserName(value string) bool {
	return value != "" && utf8.ValidString(value) &&
		utf8.RuneCountInString(value) <= maxUserNameRunes &&
		strings.IndexFunc(value, unicode.IsControl) < 0
}

func validGooglePicture(value string) bool {
	if value == "" {
		return true
	}
	if len(value) > maxUserPictureBytes || !utf8.ValidString(value) {
		return false
	}
	picture, err := url.Parse(value)
	if err != nil || picture.Scheme != "https" || picture.Host == "" ||
		picture.User != nil || picture.Port() != "" || picture.Fragment != "" ||
		picture.Opaque != "" {
		return false
	}
	host := strings.ToLower(picture.Hostname())
	return strings.HasSuffix(host, ".googleusercontent.com") &&
		len(host) > len(".googleusercontent.com")
}
