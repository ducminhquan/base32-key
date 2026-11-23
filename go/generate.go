package base32key

import (
	"crypto/rand"
	"fmt"
	"io"
)

// GenerateOptions configure GenerateKey.
type GenerateOptions struct {
	Options
	// Groups of 20 random bits each. Zero means 4 (80 bits).
	Groups int
	// Filter rejects a candidate key when it returns false, e.g. a key
	// that is already in use. Nil accepts every key.
	Filter func(key string) bool
	// MaxAttempts is how many candidates to try. Zero means 100.
	MaxAttempts int
	// Random is the source of random bytes. Nil means crypto/rand.
	Random io.Reader
}

// GenerateKey returns a random key, for example a product key or a voucher
// code. It returns an *Error with code GENERATION_FAILED when Filter
// rejects MaxAttempts candidates in a row.
func GenerateKey(g GenerateOptions) (string, error) {
	groups, attempts, random := g.Groups, g.MaxAttempts, g.Random
	if groups == 0 {
		groups = 4
	}
	if attempts == 0 {
		attempts = 100
	}
	if random == nil {
		random = rand.Reader
	}
	if groups < 1 || attempts < 1 {
		return "", fmt.Errorf("groups and MaxAttempts must be positive, got %d and %d", groups, attempts)
	}
	if err := g.checkPrefix(); err != nil {
		return "", err
	}
	buf := make([]byte, groups*4)
	for i := 0; i < attempts; i++ {
		if _, err := io.ReadFull(random, buf); err != nil {
			return "", err
		}
		// 256 is a multiple of 32, so masking keeps the digits uniform.
		digits := make([]int, len(buf))
		for j, b := range buf {
			digits[j] = int(b & 31)
		}
		key := encodeKey(digits, g.Options, true)
		if g.Filter == nil || g.Filter(key) {
			return key, nil
		}
	}
	return "", &Error{
		Code:          GenerationFailed,
		Message:       fmt.Sprintf("No key accepted by filter after %d attempts", attempts),
		InvalidGroups: []int{},
	}
}
