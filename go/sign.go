package base32key

import (
	"crypto/hmac"
	"crypto/sha256"
	"errors"
	"fmt"
)

// DefaultTagBytes is the signature length used when tagBytes is 0.
const DefaultTagBytes = 5

func resolveTagBytes(tagBytes int) (int, error) {
	if tagBytes == 0 {
		return DefaultTagBytes, nil
	}
	if tagBytes < 4 || tagBytes > 32 {
		return 0, fmt.Errorf("tagBytes must be from 4 to 32, got %d", tagBytes)
	}
	return tagBytes, nil
}

func tag(secret, payload []byte, n int) ([]byte, error) {
	if len(secret) == 0 {
		return nil, errors.New("the signing secret must not be empty")
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write(payload)
	return mac.Sum(nil)[:n], nil
}

// SignKey makes a key that carries payload and an HMAC-SHA256 tag of
// tagBytes bytes (0 means 5), so only someone with secret can create valid
// keys. The keys are the same as signKey in the npm package. o.Grouped is
// ignored: signed keys are always grouped.
func SignKey(payload, secret []byte, tagBytes int, o Options) (string, error) {
	n, err := resolveTagBytes(tagBytes)
	if err != nil {
		return "", err
	}
	t, err := tag(secret, payload, n)
	if err != nil {
		return "", err
	}
	o.Grouped = true
	return FromBytes(append(append([]byte{}, payload...), t...), true, o)
}

// VerifyKey checks a key made by SignKey and returns its payload. A
// mistyped key gives the usual *Error; a well-formed key that was not
// signed with secret gives an *Error with code INVALID_SIGNATURE.
func VerifyKey(key string, secret []byte, tagBytes int, o Options) ([]byte, error) {
	n, err := resolveTagBytes(tagBytes)
	if err != nil {
		return nil, err
	}
	o.Grouped = true
	signed, err := ToBytes(key, true, o)
	if err != nil {
		return nil, err
	}
	if len(signed) < n {
		return nil, &Error{Code: InvalidSignature, Message: "Invalid key: too short to carry a signature", InvalidGroups: []int{}}
	}
	payload, got := signed[:len(signed)-n], signed[len(signed)-n:]
	want, err := tag(secret, payload, n)
	if err != nil {
		return nil, err
	}
	if !hmac.Equal(got, want) {
		return nil, &Error{Code: InvalidSignature, Message: "Invalid key: the signature does not match", InvalidGroups: []int{}}
	}
	return payload, nil
}
