package base32key

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"math/big"
	"math/bits"
	"regexp"
	"strings"
	"time"
)

// Error codes of key templates.
const (
	UnknownTemplate = "UNKNOWN_TEMPLATE"
	Expired         = "EXPIRED"
)

const (
	maxFieldBits = 256
	maxUint      = 1<<53 - 1
	feistelRound = 10
	dateLayout   = "2006-01-02"
)

var (
	fieldName    = regexp.MustCompile(`^[A-Za-z_][A-Za-z0-9_]*$`)
	epoch        = time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	feistelLabel = []byte("B32K")
)

// TemplateField is one field of a key template.
type TemplateField struct {
	Name string `json:"name"`
	// Type is "uint", "date", "enum" or "bool".
	Type string `json:"type"`
	// Bits is the width of a uint (1 to 48) or a date (8 to 24, default
	// 16, which reaches 2199-06-06).
	Bits int `json:"bits,omitempty"`
	// Unit (uint only): values are multiples of Unit, stored divided by it.
	Unit uint64 `json:"unit,omitempty"`
	// Values (enum only): 2 to 256 distinct names.
	Values []string `json:"values,omitempty"`
}

// TemplateDefinition describes a kind of key, in the same JSON as
// defineKeyTemplate in the npm package.
type TemplateDefinition struct {
	// ID (0 to 255) tells templates apart.
	ID     int             `json:"id"`
	Fields []TemplateField `json:"fields"`
	// Expires names a date field: Verify rejects the key after that date.
	Expires string `json:"expires,omitempty"`
	// TagBytes is the signature length, 4 to 32; nil means 5. A pointer to
	// 0 means no signature, which needs Encrypt.
	TagBytes *int `json:"tagBytes,omitempty"`
	// Encrypt scrambles the fields with the secret, so serial numbers and
	// amounts cannot be read or counted from the key.
	Encrypt bool   `json:"encrypt,omitempty"`
	Prefix  string `json:"prefix,omitempty"`
	// Case is "upper" (default) or "lower".
	Case string `json:"case,omitempty"`
}

type field struct {
	TemplateField
	width int
	limit uint64 // largest uint value
}

// KeyTemplate signs and verifies keys of one TemplateDefinition.
type KeyTemplate struct {
	Definition TemplateDefinition
	// Groups is the number of groups of every key.
	Groups int

	fields                  []field
	tagBytes, bodyBits, pad int
}

// TemplateVerifyOptions are the options of KeyTemplate.Verify.
type TemplateVerifyOptions struct {
	// Today is the date of the expiry check; only its year, month and day
	// count. The zero value means the current UTC date: pass the local date
	// where the key is redeemed.
	Today time.Time
	// Strict checks the key exactly as typed, without ignoring spaces,
	// hyphens and case.
	Strict bool
}

// ParseKeyTemplate reads a JSON definition and calls NewKeyTemplate.
func ParseKeyTemplate(definition []byte) (*KeyTemplate, error) {
	var d TemplateDefinition
	if err := json.Unmarshal(definition, &d); err != nil {
		return nil, err
	}
	return NewKeyTemplate(d)
}

// NewKeyTemplate checks a definition and returns its template.
func NewKeyTemplate(d TemplateDefinition) (*KeyTemplate, error) {
	if d.ID < 0 || d.ID > 255 {
		return nil, fmt.Errorf("id must be an integer from 0 to 255, got %d", d.ID)
	}
	tagBytes := 5
	if d.TagBytes != nil {
		tagBytes = *d.TagBytes
	}
	if !(tagBytes == 0 && d.Encrypt) && (tagBytes < 4 || tagBytes > 32) {
		return nil, fmt.Errorf("tagBytes must be an integer from 4 to 32, got %d", tagBytes)
	}
	if d.Case != "" && d.Case != "upper" && d.Case != "lower" {
		return nil, fmt.Errorf("invalid case option: %s", d.Case)
	}
	if err := (Options{Prefix: d.Prefix}).checkPrefix(); err != nil {
		return nil, err
	}
	if len(d.Fields) == 0 {
		return nil, errors.New("fields must be a non-empty array")
	}
	t := &KeyTemplate{tagBytes: tagBytes}
	names := map[string]bool{}
	total := 0
	for i, spec := range d.Fields {
		f, err := newField(spec, i)
		if err != nil {
			return nil, err
		}
		if names[f.Name] {
			return nil, errors.New("field names must be unique")
		}
		names[f.Name] = true
		total += f.width
		t.fields = append(t.fields, f)
	}
	if d.Expires != "" {
		ok := false
		for _, f := range t.fields {
			ok = ok || (f.Name == d.Expires && f.Type == "date")
		}
		if !ok {
			return nil, fmt.Errorf("expires must name a date field, got %s", d.Expires)
		}
	}
	if total > maxFieldBits {
		return nil, fmt.Errorf("the fields need %d bits, more than %d", total, maxFieldBits)
	}
	d.Fields = append([]TemplateField{}, d.Fields...)
	t.Definition = d
	t.Groups = (8 + total + 8*tagBytes + 19) / 20
	t.bodyBits = 20*t.Groups - 8*tagBytes
	t.pad = t.bodyBits - 8 - total
	return t, nil
}

func newField(spec TemplateField, i int) (field, error) {
	f := field{TemplateField: spec}
	if !fieldName.MatchString(spec.Name) {
		return f, fmt.Errorf("fields[%d].name must be an identifier, got %q", i, spec.Name)
	}
	switch spec.Type {
	case "uint":
		if spec.Bits < 1 || spec.Bits > 48 {
			return f, fmt.Errorf("%s.bits must be an integer from 1 to 48, got %d", spec.Name, spec.Bits)
		}
		if f.Unit == 0 {
			f.Unit = 1
		}
		if f.Unit > maxUint {
			return f, fmt.Errorf("%s.unit must be an integer from 1 to %d, got %d", spec.Name, uint64(maxUint), f.Unit)
		}
		f.width = spec.Bits
		hi, lo := bits.Mul64(1<<spec.Bits-1, f.Unit)
		f.limit = maxUint
		if hi == 0 && lo < maxUint {
			f.limit = lo
		}
	case "date":
		if f.Bits == 0 {
			f.Bits = 16
		}
		if f.Bits < 8 || f.Bits > 24 {
			return f, fmt.Errorf("%s.bits must be an integer from 8 to 24, got %d", spec.Name, f.Bits)
		}
		f.width = f.Bits
	case "enum":
		seen := map[string]bool{}
		for _, v := range spec.Values {
			if v == "" || seen[v] {
				seen = nil
				break
			}
			seen[v] = true
		}
		if seen == nil || len(spec.Values) < 2 || len(spec.Values) > 256 {
			return f, fmt.Errorf("%s.values must be 2 to 256 distinct non-empty strings", spec.Name)
		}
		f.Values = append([]string{}, spec.Values...)
		f.width = bits.Len(uint(len(spec.Values) - 1))
	case "bool":
		f.width = 1
	default:
		return f, fmt.Errorf("fields[%d].type must be uint, date, enum or bool, got %q", i, spec.Type)
	}
	return f, nil
}

func days(name string, value any) (uint64, int64, error) {
	var d time.Time
	switch v := value.(type) {
	case time.Time:
		d = time.Date(v.Year(), v.Month(), v.Day(), 0, 0, 0, 0, time.UTC)
	case string:
		var err error
		if d, err = time.Parse(dateLayout, v); err != nil {
			return 0, 0, fmt.Errorf(`%s must be a date "YYYY-MM-DD", got %q`, name, v)
		}
	default:
		return 0, 0, fmt.Errorf(`%s must be a date "YYYY-MM-DD", got %v`, name, value)
	}
	n := int64(d.Sub(epoch).Hours()) / 24
	return uint64(n), n, nil
}

func toUint(name string, value any) (uint64, error) {
	switch v := value.(type) {
	case int:
		if v >= 0 {
			return uint64(v), nil
		}
	case int64:
		if v >= 0 {
			return uint64(v), nil
		}
	case int32:
		if v >= 0 {
			return uint64(v), nil
		}
	case uint:
		return uint64(v), nil
	case uint64:
		return v, nil
	case uint32:
		return uint64(v), nil
	case float64: // from encoding/json
		if v >= 0 && v <= maxUint && v == float64(uint64(v)) {
			return uint64(v), nil
		}
	}
	return 0, fmt.Errorf("%s must be a non-negative integer, got %v", name, value)
}

func (f field) encode(value any) (uint64, error) {
	switch f.Type {
	case "uint":
		n, err := toUint(f.Name, value)
		if err != nil {
			return 0, err
		}
		if n > f.limit {
			return 0, fmt.Errorf("%s must be an integer from 0 to %d, got %d", f.Name, f.limit, n)
		}
		if n%f.Unit != 0 {
			return 0, fmt.Errorf("%s must be a multiple of %d, got %d", f.Name, f.Unit, n)
		}
		return n / f.Unit, nil
	case "date":
		n, signed, err := days(f.Name, value)
		if err != nil {
			return 0, err
		}
		if signed < 0 || n >= 1<<f.Bits {
			last := epoch.AddDate(0, 0, 1<<f.Bits-1).Format(dateLayout)
			return 0, fmt.Errorf("%s must be from 2020-01-01 to %s, got %v", f.Name, last, value)
		}
		return n, nil
	case "enum":
		for i, v := range f.Values {
			if v == value {
				return uint64(i), nil
			}
		}
		return 0, fmt.Errorf("%s must be one of %v, got %v", f.Name, f.Values, value)
	default:
		b, ok := value.(bool)
		if !ok {
			return 0, fmt.Errorf("%s must be true or false, got %v", f.Name, value)
		}
		if b {
			return 1, nil
		}
		return 0, nil
	}
}

// decode returns nil for an enum index past the list.
func (f field) decode(stored uint64) any {
	switch f.Type {
	case "uint":
		return stored * f.Unit
	case "date":
		return epoch.AddDate(0, 0, int(stored))
	case "enum":
		if stored >= uint64(len(f.Values)) {
			return nil
		}
		return f.Values[stored]
	default:
		return stored == 1
	}
}

func mask(n int) *big.Int {
	return new(big.Int).Sub(new(big.Int).Lsh(big.NewInt(1), uint(n)), big.NewInt(1))
}

func fixedBytes(x *big.Int, n int) []byte {
	return x.FillBytes(make([]byte, (n+7)/8))
}

func roundValue(secret []byte, r int, x *big.Int, xBits, width int) *big.Int {
	mac := hmac.New(sha256.New, secret)
	mac.Write(feistelLabel)
	mac.Write([]byte{byte(r)})
	mac.Write(fixedBytes(x, xBits))
	out := new(big.Int).SetBytes(mac.Sum(nil)[:(width+7)/8])
	return out.And(out, mask(width))
}

func feistel(secret []byte, value *big.Int, n int, decrypt bool) *big.Int {
	rightBits := n / 2
	leftBits := n - rightBits
	left := new(big.Int).Rsh(value, uint(rightBits))
	right := new(big.Int).And(value, mask(rightBits))
	for step := 0; step < feistelRound; step++ {
		r := step
		if decrypt {
			r = feistelRound - 1 - step
		}
		if r%2 == 0 {
			left.Xor(left, roundValue(secret, r, right, rightBits, leftBits))
		} else {
			right.Xor(right, roundValue(secret, r, left, leftBits, rightBits))
		}
	}
	return left.Lsh(left, uint(rightBits)).Or(left, right)
}

func (t *KeyTemplate) tag(secret []byte, body *big.Int) []byte {
	mac := hmac.New(sha256.New, secret)
	mac.Write(fixedBytes(body, t.bodyBits))
	return mac.Sum(nil)[:t.tagBytes]
}

func (t *KeyTemplate) options() Options {
	return Options{Grouped: true, Checked: true, Lower: t.Definition.Case == "lower", Prefix: t.Definition.Prefix}
}

func unknownTemplate(detail string) error {
	return &Error{Code: UnknownTemplate, Message: "Invalid key: " + detail, InvalidGroups: []int{}}
}

// Sign makes a key that carries values, one per field: an integer for a
// uint, a time.Time or "YYYY-MM-DD" string for a date, a string for an enum
// and a bool for a bool. The keys are the same as in the npm package.
func (t *KeyTemplate) Sign(values map[string]any, secret []byte) (string, error) {
	if len(secret) == 0 {
		return "", errors.New("the signing secret must not be empty")
	}
	for name := range values {
		known := false
		for _, f := range t.fields {
			known = known || f.Name == name
		}
		if !known {
			return "", fmt.Errorf("unknown field %s", name)
		}
	}
	body := big.NewInt(int64(t.Definition.ID))
	for _, f := range t.fields {
		value, ok := values[f.Name]
		if !ok {
			return "", fmt.Errorf("missing field %s", f.Name)
		}
		n, err := f.encode(value)
		if err != nil {
			return "", err
		}
		body.Lsh(body, uint(f.width)).Or(body, new(big.Int).SetUint64(n))
	}
	body.Lsh(body, uint(t.pad))
	if t.Definition.Encrypt {
		body = feistel(secret, body, t.bodyBits, false)
	}
	key := new(big.Int).Lsh(body, uint(8*t.tagBytes))
	key.Or(key, new(big.Int).SetBytes(t.tag(secret, body)))
	return FromHex(fmt.Sprintf("%0*x", 5*t.Groups, key), t.options())
}

func (t *KeyTemplate) unpack(body *big.Int) (map[string]any, error) {
	id := new(big.Int).Rsh(body, uint(t.bodyBits-8))
	if id.Int64() != int64(t.Definition.ID) || new(big.Int).And(body, mask(t.pad)).Sign() != 0 {
		return nil, unknownTemplate(fmt.Sprintf("it was not made with template %d", t.Definition.ID))
	}
	rest := new(big.Int).Rsh(body, uint(t.pad))
	out := make(map[string]any, len(t.fields))
	for i := len(t.fields) - 1; i >= 0; i-- {
		f := t.fields[i]
		value := f.decode(new(big.Int).And(rest, mask(f.width)).Uint64())
		if value == nil {
			return nil, unknownTemplate(f.Name + " is out of range")
		}
		out[f.Name] = value
		rest.Rsh(rest, uint(f.width))
	}
	return out, nil
}

// Verify checks a key and returns its values: uint64 for a uint, a UTC
// time.Time for a date, a string for an enum and a bool for a bool. A
// mistyped key gives the usual *Error; a key of another template gives
// UNKNOWN_TEMPLATE, one not signed with secret INVALID_SIGNATURE and one
// past its expires date EXPIRED.
func (t *KeyTemplate) Verify(key string, secret []byte, o TemplateVerifyOptions) (map[string]any, error) {
	opts := t.options()
	opts.AutoCase = true
	opts.Normalize = !o.Strict
	opts.Groups = t.Groups
	h, err := paddedHex(key, opts)
	if err != nil {
		return nil, err
	}
	value, _ := new(big.Int).SetString(h, 16)
	body := new(big.Int).Rsh(value, uint(8*t.tagBytes))
	if !t.Definition.Encrypt {
		if _, err := t.unpack(body); err != nil {
			return nil, err
		}
	}
	if len(secret) == 0 {
		return nil, errors.New("the signing secret must not be empty")
	}
	if t.tagBytes > 0 {
		got := fixedBytes(new(big.Int).And(value, mask(8*t.tagBytes)), 8*t.tagBytes)
		if !hmac.Equal(got, t.tag(secret, body)) {
			return nil, &Error{Code: InvalidSignature, Message: "Invalid key: the signature does not match", InvalidGroups: []int{}}
		}
	}
	if t.Definition.Encrypt {
		body = feistel(secret, body, t.bodyBits, true)
	}
	values, err := t.unpack(body)
	if err != nil {
		return nil, err
	}
	if t.Definition.Expires != "" {
		today := o.Today
		if today.IsZero() {
			today = time.Now().UTC()
		}
		today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, time.UTC)
		expires := values[t.Definition.Expires].(time.Time)
		if today.After(expires) {
			return nil, &Error{Code: Expired, Message: "Invalid key: it expired on " + expires.Format(dateLayout), InvalidGroups: []int{}}
		}
	}
	return values, nil
}

// VerifyKeyTemplates checks key against several templates and returns the
// one that fits with the key's values. If none fits it returns the
// INVALID_SIGNATURE error of a template whose layout fits, or else
// UNKNOWN_TEMPLATE.
func VerifyKeyTemplates(templates []*KeyTemplate, key string, secret []byte, o TemplateVerifyOptions) (*KeyTemplate, map[string]any, error) {
	var signatureErr error
	for _, t := range templates {
		values, err := t.Verify(key, secret, o)
		if err == nil {
			return t, values, nil
		}
		var e *Error
		if !errors.As(err, &e) {
			return nil, nil, err
		}
		switch {
		case e.Code == InvalidSignature:
			signatureErr = err
		case e.Code == UnknownTemplate, e.Code == InvalidPrefix,
			e.Code == InvalidLength && strings.Contains(e.Message, " groups, got "):
		default:
			return nil, nil, err
		}
	}
	if signatureErr != nil {
		return nil, nil, signatureErr
	}
	return nil, nil, unknownTemplate("it matches none of the templates")
}

// VoucherPreset is template 1: campaign, expires, amount (multiples of
// 1000) and serial, in 6 groups. Change the copy it returns, e.g. set
// Prefix or Encrypt.
func VoucherPreset() TemplateDefinition {
	return TemplateDefinition{ID: 1, Expires: "expires", Fields: []TemplateField{
		{Name: "campaign", Type: "uint", Bits: 12},
		{Name: "expires", Type: "date"},
		{Name: "amount", Type: "uint", Bits: 16, Unit: 1000},
		{Name: "serial", Type: "uint", Bits: 20},
	}}
}

// ActivationPreset is template 2: product, expires and serial, in 6 groups.
func ActivationPreset() TemplateDefinition {
	return TemplateDefinition{ID: 2, Expires: "expires", Fields: []TemplateField{
		{Name: "product", Type: "uint", Bits: 16},
		{Name: "expires", Type: "date"},
		{Name: "serial", Type: "uint", Bits: 24},
	}}
}

// MemberPreset is template 3: member (32 bits) and tier (standard, silver,
// gold, platinum), in 5 groups.
func MemberPreset() TemplateDefinition {
	return TemplateDefinition{ID: 3, Fields: []TemplateField{
		{Name: "member", Type: "uint", Bits: 32},
		{Name: "tier", Type: "enum", Values: []string{"standard", "silver", "gold", "platinum"}},
	}}
}

// Presets are the ready-made definitions by name.
var Presets = map[string]func() TemplateDefinition{
	"voucher":    VoucherPreset,
	"activation": ActivationPreset,
	"member":     MemberPreset,
}
