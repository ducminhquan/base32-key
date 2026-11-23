// Package base32key encodes values as human-friendly Base32 keys with a
// check digit per group, such as 222ET-3ZZGN.
//
// It is a port of the base32-key npm package (encoding, per-group errors,
// normalized input, prefixes, random and HMAC-signed keys) and is tested
// against the same test vectors, so keys are interchangeable.
package base32key

import (
	"encoding/hex"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// Alphabets for upper- and lowercase keys.
const (
	Upper = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
	Lower = "abcdefghijkmnpqrstuvwxyz23456789"
)

// MaxLengthPrefixedBytes is the largest byte length a WithLength key can store.
const MaxLengthPrefixedBytes = 0xfffff

var crc5Table = [32]int{
	0, 5, 10, 15, 20, 17, 30, 27, 13, 8, 7, 2, 25, 28, 19, 22,
	26, 31, 16, 21, 14, 11, 4, 1, 23, 18, 29, 24, 3, 6, 9, 12,
}

// Options control the key format. The zero value is not the default: use
// DefaultOptions (grouped, checked, uppercase) and change what you need.
type Options struct {
	Grouped bool
	Checked bool
	Lower   bool
	// Prefix (letters and digits) is put in front of the key, as in
	// LC-222ET-3ZZGN, and required when decoding.
	Prefix string
	// Normalize (decoding only) ignores spaces and hyphens and folds the
	// case, so "lc 222et 3zzgn" reads as "LC-222ET-3ZZGN".
	Normalize bool
	// AutoCase (decoding only) tries the uppercase alphabet, then the
	// lowercase one, and keeps the one whose check digits match. Lower is
	// ignored. Like case: 'auto' in the npm package.
	AutoCase bool
	// Groups (decoding only, grouped keys) is the exact number of groups a
	// key must have; missing or extra groups give INVALID_LENGTH. Zero
	// means any number. FormatInput keeps at most this many groups.
	Groups int
}

// DefaultOptions are grouped, checked, uppercase keys.
var DefaultOptions = Options{Grouped: true, Checked: true}

// Error codes, the same as the JavaScript package.
const (
	InvalidHex       = "INVALID_HEX"
	InvalidCharacter = "INVALID_CHARACTER"
	InvalidLength    = "INVALID_LENGTH"
	ChecksumMismatch = "CHECKSUM_MISMATCH"
	InvalidPrefix    = "INVALID_PREFIX"
	InvalidSignature = "INVALID_SIGNATURE"
	GenerationFailed = "GENERATION_FAILED"
)

// Error reports invalid input. InvalidGroups holds 0-based group indexes.
type Error struct {
	Code          string
	Message       string
	InvalidGroups []int
}

func (e *Error) Error() string { return e.Message }

func (o Options) alphabet() string {
	if o.Lower {
		return Lower
	}
	return Upper
}

func crc5(digits []int) int {
	crc := 0
	for _, d := range digits {
		crc = crc5Table[d^crc]
	}
	return crc
}

var prefixPattern = regexp.MustCompile(`^[A-Za-z0-9]*$`)

func (o Options) checkPrefix() error {
	if !prefixPattern.MatchString(o.Prefix) {
		return fmt.Errorf("prefix must contain only letters and digits, got %q", o.Prefix)
	}
	return nil
}

func (o Options) checkGroups() error {
	if o.Groups < 0 {
		return fmt.Errorf("groups must not be negative, got %d", o.Groups)
	}
	if o.Groups > 0 && !o.Grouped {
		return errors.New("the Groups option requires grouped keys")
	}
	return nil
}

func addPrefix(key, prefix string) string {
	if prefix == "" {
		return key
	}
	return prefix + "-" + key
}

var leadingSeparators = regexp.MustCompile(`^[\s-]+`)
var separators = regexp.MustCompile(`[\s-]+`)

// stripPrefix removes o.Prefix from the front of key; ok is false when the
// key does not start with it.
func stripPrefix(key string, o Options) (string, bool) {
	p := o.Prefix
	if p == "" {
		return key, true
	}
	if !o.Normalize {
		if strings.HasPrefix(key, p+"-") {
			return key[len(p)+1:], true
		}
		return "", false
	}
	cleaned := leadingSeparators.ReplaceAllString(key, "")
	if len(cleaned) >= len(p) && strings.EqualFold(cleaned[:len(p)], p) {
		return cleaned[len(p):], true
	}
	return "", false
}

func splitKey(key string, o Options) []string {
	if !o.Normalize {
		return strings.Split(key, "-")
	}
	folded := separators.ReplaceAllString(key, "")
	if o.Lower {
		folded = strings.ToLower(folded)
	} else {
		folded = strings.ToUpper(folded)
	}
	if !o.Grouped {
		return []string{folded}
	}
	size := 4
	if o.Checked {
		size = 5
	}
	groups := []string{}
	for i := 0; i < len(folded); i += size {
		end := i + size
		if end > len(folded) {
			end = len(folded)
		}
		groups = append(groups, folded[i:end])
	}
	if len(groups) == 0 {
		groups = []string{""}
	}
	return groups
}

func encodeKey(digits []int, o Options, keepLeadingZeros bool) string {
	alphabet := o.alphabet()
	if o.Grouped {
		groups := make([]string, 0, len(digits)/4)
		for i := 0; i < len(digits); i += 4 {
			group := append([]int{}, digits[i:i+4]...)
			if o.Checked {
				group = append(group, crc5(group))
			}
			groups = append(groups, encodeDigits(group, alphabet))
		}
		return addPrefix(strings.Join(groups, "-"), o.Prefix)
	}
	if o.Checked {
		digits = append(digits, crc5(digits))
	}
	i := 0
	for !keepLeadingZeros && i+1 < len(digits) && digits[i] == 0 {
		i++
	}
	return addPrefix(encodeDigits(digits[i:], alphabet), o.Prefix)
}

func encodeDigits(digits []int, alphabet string) string {
	var b strings.Builder
	for _, d := range digits {
		b.WriteByte(alphabet[d])
	}
	return b.String()
}

// FromHex encodes a hex string (an optional 0x prefix is allowed).
func FromHex(hexString string, o Options) (string, error) {
	if err := o.checkPrefix(); err != nil {
		return "", err
	}
	h := hexString
	if len(h) >= 2 && (h[:2] == "0x" || h[:2] == "0X") {
		h = h[2:]
	}
	h = strings.ToLower(h)
	if h == "" || strings.Trim(h, "0123456789abcdef") != "" {
		return "", &Error{Code: InvalidHex, Message: fmt.Sprintf("Invalid hex string: %q", hexString)}
	}
	if r := len(h) % 5; r != 0 {
		h = strings.Repeat("0", 5-r) + h
	}
	digits := make([]int, 0, len(h)/5*4)
	for i := 0; i < len(h); i += 5 {
		w, _ := strconv.ParseUint(h[i:i+5], 16, 32)
		word := int(w)
		digits = append(digits, (word>>15)&31, (word>>10)&31, (word>>5)&31, word&31)
	}
	return encodeKey(digits, o, false), nil
}

func decodeGroup(group string, o Options) (string, string) {
	alphabet := o.alphabet()
	digits := make([]int, 0, len(group))
	for _, c := range group {
		d := strings.IndexRune(alphabet, c)
		if d < 0 {
			return "", InvalidCharacter
		}
		digits = append(digits, d)
	}
	size := 4
	if o.Checked {
		size = 5
	}
	if len(digits) == 0 || (o.Grouped && len(digits) != size) {
		return "", InvalidLength
	}
	if o.Checked {
		check := digits[len(digits)-1]
		digits = digits[:len(digits)-1]
		if crc5(digits) != check {
			return "", ChecksumMismatch
		}
	}
	for len(digits)%4 != 0 {
		digits = append([]int{0}, digits...)
	}
	var b strings.Builder
	for i := 0; i < len(digits); i += 4 {
		word := digits[i]<<15 | digits[i+1]<<10 | digits[i+2]<<5 | digits[i+3]
		fmt.Fprintf(&b, "%05x", word)
	}
	return b.String(), ""
}

// Result is the outcome of Validate.
type Result struct {
	Valid         bool
	InvalidGroups []int
	Code          string
}

func analyzeWith(key string, o Options) (string, Result, [2]int) {
	var b strings.Builder
	res := Result{InvalidGroups: []int{}}
	var count [2]int
	body, ok := stripPrefix(key, o)
	if !ok {
		res.Code = InvalidPrefix
		return "", res, count
	}
	groups := splitKey(body, o)
	for i, group := range groups {
		h, code := decodeGroup(group, o)
		if code != "" {
			res.InvalidGroups = append(res.InvalidGroups, i)
			if res.Code == "" {
				res.Code = code
			}
			continue
		}
		b.WriteString(h)
	}
	if want := o.Groups; want > 0 && o.Grouped && len(groups) != want {
		// Flag the missing groups, or the extra ones.
		lo, hi := len(groups), want
		if lo > hi {
			lo, hi = hi, lo
		}
		for i := lo; i < hi; i++ {
			res.InvalidGroups = append(res.InvalidGroups, i)
		}
		sort.Ints(res.InvalidGroups)
		if res.Code == "" {
			res.Code = InvalidLength
		}
		count = [2]int{want, len(groups)}
	}
	res.Valid = res.Code == ""
	return b.String(), res, count
}

// analyze decodes a key; count is {expected, actual} when o.Groups does
// not match the number of groups.
func analyze(key string, o Options) (string, Result, [2]int) {
	if !o.AutoCase {
		return analyzeWith(key, o)
	}
	o.Lower = false
	h, res, count := analyzeWith(key, o)
	if res.Valid {
		return h, res, count
	}
	o.Lower = true
	h2, res2, count2 := analyzeWith(key, o)
	if res2.Valid || len(res2.InvalidGroups) < len(res.InvalidGroups) {
		return h2, res2, count2
	}
	return h, res, count
}

// Validate checks a key without returning an error. Groups is ignored when
// it is negative or the key is not grouped (ToHex reports those as errors).
func Validate(key string, o Options) Result {
	_, res, _ := analyze(key, o)
	return res
}

var messages = map[string]string{
	InvalidCharacter: "a character outside the alphabet",
	InvalidLength:    "the wrong length",
	ChecksumMismatch: "a check digit that does not match",
}

func paddedHex(key string, o Options) (string, error) {
	if err := o.checkPrefix(); err != nil {
		return "", err
	}
	if err := o.checkGroups(); err != nil {
		return "", err
	}
	h, res, count := analyze(key, o)
	if res.Valid {
		return h, nil
	}
	if res.Code == InvalidPrefix {
		return "", &Error{Code: InvalidPrefix, Message: fmt.Sprintf("Invalid key: expected the prefix %q", o.Prefix), InvalidGroups: []int{}}
	}
	if count[0] > 0 {
		return "", &Error{
			Code:          InvalidLength,
			Message:       fmt.Sprintf("Invalid key: expected %d groups, got %d", count[0], count[1]),
			InvalidGroups: res.InvalidGroups,
		}
	}
	where := fmt.Sprintf("group %d has", res.InvalidGroups[0]+1)
	if len(res.InvalidGroups) > 1 {
		parts := make([]string, len(res.InvalidGroups))
		for i, g := range res.InvalidGroups {
			parts[i] = strconv.Itoa(g + 1)
		}
		where = "groups " + strings.Join(parts, ", ") + " have"
	}
	return "", &Error{
		Code:          res.Code,
		Message:       fmt.Sprintf("Invalid key: %s %s", where, messages[res.Code]),
		InvalidGroups: res.InvalidGroups,
	}
}

// ToHex decodes a key to a hex string without leading zeros.
func ToHex(key string, o Options) (string, error) {
	h, err := paddedHex(key, o)
	if err != nil {
		return "", err
	}
	h = strings.TrimLeft(h, "0")
	if h == "" {
		h = "0"
	}
	return h, nil
}

var errNotGrouped = errors.New("withLength requires grouped keys")

// FromBytes encodes bytes. With withLength the first group stores the byte
// count, so leading zero bytes survive and cut keys are detected.
func FromBytes(data []byte, withLength bool, o Options) (string, error) {
	h := hex.EncodeToString(data)
	if !withLength {
		if len(data) == 0 {
			return "", errors.New("cannot encode empty bytes without withLength")
		}
		return FromHex(h, o)
	}
	if !o.Grouped {
		return "", errNotGrouped
	}
	if len(data) > MaxLengthPrefixedBytes {
		return "", fmt.Errorf("withLength supports at most %d bytes", MaxLengthPrefixedBytes)
	}
	if r := len(h) % 5; r != 0 {
		h = strings.Repeat("0", 5-r) + h
	}
	return FromHex(fmt.Sprintf("%05x", len(data))+h, o)
}

// ToBytes decodes a key made by FromBytes.
func ToBytes(key string, withLength bool, o Options) ([]byte, error) {
	if !withLength {
		h, err := ToHex(key, o)
		if err != nil {
			return nil, err
		}
		if len(h)%2 == 1 {
			h = "0" + h
		}
		return hex.DecodeString(h)
	}
	if !o.Grouped {
		return nil, errNotGrouped
	}
	h, err := paddedHex(key, o)
	if err != nil {
		return nil, err
	}
	n64, _ := strconv.ParseUint(h[:5], 16, 32)
	n := int(n64)
	data := h[5:]
	expected := (n*2 + 4) / 5 * 5
	if len(data) != expected || strings.Trim(data[:expected-n*2], "0") != "" {
		return nil, &Error{
			Code:    InvalidLength,
			Message: fmt.Sprintf("Invalid key: a %d-byte value needs %d groups, got %d", n, expected/5+1, len(h)/5),
		}
	}
	return hex.DecodeString(data[expected-n*2:])
}

// ToBytesLength decodes a key made by FromBytes without withLength and
// left-pads the result with zero bytes to length bytes, like the npm
// package's length option. A value that needs more bytes gives an *Error
// with code INVALID_LENGTH.
func ToBytesLength(key string, length int, o Options) ([]byte, error) {
	if length < 0 {
		return nil, fmt.Errorf("length must not be negative, got %d", length)
	}
	data, err := ToBytes(key, false, o)
	if err != nil {
		return nil, err
	}
	if len(data) == 1 && data[0] == 0 {
		data = nil
	}
	if len(data) > length {
		return nil, &Error{
			Code:          InvalidLength,
			Message:       fmt.Sprintf("Invalid key: the value needs %d bytes, more than %d", len(data), length),
			InvalidGroups: []int{},
		}
	}
	return append(make([]byte, length-len(data)), data...), nil
}
