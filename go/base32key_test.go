package base32key

import (
	"bytes"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"testing"
)

type vectors struct {
	Valid []struct {
		Hex   string            `json:"hex"`
		Upper map[string]string `json:"upper"`
		Lower map[string]string `json:"lower"`
	} `json:"valid"`
	Invalid []struct {
		Key           string `json:"key"`
		Code          string `json:"code"`
		InvalidGroups []int  `json:"invalidGroups"`
	} `json:"invalid"`
	Bytes []struct {
		Hex        string `json:"hex"`
		WithLength string `json:"withLength"`
	} `json:"bytes"`
	Signed []struct {
		PayloadHex string `json:"payloadHex"`
		Secret     string `json:"secret"`
		TagBytes   int    `json:"tagBytes"`
		Prefix     string `json:"prefix"`
		Case       string `json:"case"`
		Key        string `json:"key"`
	} `json:"signed"`
	InvalidSigned []struct {
		Key      string `json:"key"`
		Secret   string `json:"secret"`
		TagBytes int    `json:"tagBytes"`
		Code     string `json:"code"`
	} `json:"invalidSigned"`
	Prefixed []struct {
		Hex    string `json:"hex"`
		Prefix string `json:"prefix"`
		Key    string `json:"key"`
	} `json:"prefixed"`
	InvalidPrefixed []struct {
		Key    string `json:"key"`
		Prefix string `json:"prefix"`
		Code   string `json:"code"`
	} `json:"invalidPrefixed"`
	Normalized []struct {
		Input   string `json:"input"`
		Prefix  string `json:"prefix"`
		Grouped *bool  `json:"grouped"`
		Case    string `json:"case"`
		Hex     string `json:"hex"`
	} `json:"normalized"`
}

func load(t *testing.T) vectors {
	raw, err := os.ReadFile("../test-vectors.json")
	if errors.Is(err, os.ErrNotExist) {
		// The vectors live at the repository root, outside the module zip.
		t.Skip("../test-vectors.json not found; run the tests from a clone")
	}
	if err != nil {
		t.Fatal(err)
	}
	var v vectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

var modes = map[string]Options{
	"grouped":            {Grouped: true, Checked: true},
	"ungrouped":          {Checked: true},
	"groupedUnchecked":   {Grouped: true},
	"ungroupedUnchecked": {},
}

func TestValidVectors(t *testing.T) {
	for _, v := range load(t).Valid {
		for mode, o := range modes {
			for _, lower := range []bool{false, true} {
				o.Lower = lower
				key := v.Upper[mode]
				if lower {
					key = v.Lower[mode]
				}
				if got, err := FromHex(v.Hex, o); err != nil || got != key {
					t.Errorf("FromHex(%s, %+v) = %q, %v; want %q", v.Hex, o, got, err, key)
				}
				if got, err := ToHex(key, o); err != nil || got != v.Hex {
					t.Errorf("ToHex(%s, %+v) = %q, %v; want %q", key, o, got, err, v.Hex)
				}
				if !Validate(key, o).Valid {
					t.Errorf("Validate(%s) is invalid", key)
				}
			}
		}
	}
}

func TestInvalidVectors(t *testing.T) {
	for _, v := range load(t).Invalid {
		_, err := ToHex(v.Key, DefaultOptions)
		var e *Error
		if !errors.As(err, &e) || e.Code != v.Code || !reflect.DeepEqual(e.InvalidGroups, v.InvalidGroups) {
			t.Errorf("ToHex(%q) error = %v; want %s %v", v.Key, err, v.Code, v.InvalidGroups)
		}
		res := Validate(v.Key, DefaultOptions)
		if res.Valid || res.Code != v.Code || !reflect.DeepEqual(res.InvalidGroups, v.InvalidGroups) {
			t.Errorf("Validate(%q) = %+v", v.Key, res)
		}
	}
}

func TestBytesVectors(t *testing.T) {
	for _, v := range load(t).Bytes {
		data, _ := hex.DecodeString(v.Hex)
		if got, err := FromBytes(data, true, DefaultOptions); err != nil || got != v.WithLength {
			t.Errorf("FromBytes(%s) = %q, %v; want %q", v.Hex, got, err, v.WithLength)
		}
		if got, err := ToBytes(v.WithLength, true, DefaultOptions); err != nil || !bytes.Equal(got, data) {
			t.Errorf("ToBytes(%s) = %x, %v", v.WithLength, got, err)
		}
	}
}

func TestErrors(t *testing.T) {
	if got, _ := FromHex("0xC0FFEE", DefaultOptions); got != "222ET-3ZZGN" {
		t.Errorf("0x prefix: %q", got)
	}
	for _, bad := range []string{"", "0x", "xyz"} {
		var e *Error
		if _, err := FromHex(bad, DefaultOptions); !errors.As(err, &e) || e.Code != InvalidHex || e.Error() == "" {
			t.Errorf("FromHex(%q) error = %v", bad, err)
		}
	}
	if _, err := FromBytes(nil, false, DefaultOptions); err == nil {
		t.Error("empty bytes without length")
	}
	if _, err := FromBytes([]byte{1}, true, Options{}); err == nil {
		t.Error("withLength ungrouped")
	}
	if _, err := ToBytes("22222", true, Options{}); err == nil {
		t.Error("withLength ungrouped decode")
	}
	if _, err := ToBytes("222ET-3ZZGX", true, DefaultOptions); err == nil {
		t.Error("bad key with length")
	}
	if _, err := ToBytes("222ET-3ZZGX", false, DefaultOptions); err == nil {
		t.Error("bad key")
	}
	key, _ := FromBytes([]byte{0, 1, 2}, true, DefaultOptions)
	var e *Error
	if _, err := ToBytes(key[:len(key)-6], true, DefaultOptions); !errors.As(err, &e) || e.Code != InvalidLength {
		t.Errorf("cut key: %v", err)
	}
	if got, _ := ToBytes("222ET-3ZZGN", false, DefaultOptions); !bytes.Equal(got, []byte{0xc0, 0xff, 0xee}) {
		t.Errorf("ToBytes: %x", got)
	}
	if got, _ := ToBytes("2222", false, Options{Grouped: true}); !bytes.Equal(got, []byte{0}) {
		t.Errorf("zero: %x", got)
	}
	if _, err := ToHex("222EX-3ZZGN-2222", DefaultOptions); err == nil || err.Error() == "" {
		t.Error("multi-group error")
	}
}

func TestPrefixedVectors(t *testing.T) {
	v := load(t)
	for _, p := range v.Prefixed {
		o := DefaultOptions
		o.Prefix = p.Prefix
		if got, err := FromHex(p.Hex, o); err != nil || got != p.Key {
			t.Errorf("FromHex(%s, %s) = %q, %v", p.Hex, p.Prefix, got, err)
		}
		if got, err := ToHex(p.Key, o); err != nil || got != p.Hex {
			t.Errorf("ToHex(%s) = %q, %v", p.Key, got, err)
		}
	}
	for _, p := range v.InvalidPrefixed {
		o := DefaultOptions
		o.Prefix = p.Prefix
		if res := Validate(p.Key, o); res.Valid || res.Code != p.Code {
			t.Errorf("Validate(%q) = %+v", p.Key, res)
		}
		var e *Error
		if _, err := ToHex(p.Key, o); !errors.As(err, &e) || e.Code != p.Code || e.Error() == "" {
			t.Errorf("ToHex(%q) error = %v", p.Key, err)
		}
	}
	for _, n := range v.Normalized {
		o := DefaultOptions
		o.Normalize = true
		o.Prefix = n.Prefix
		o.Lower = n.Case == "lower"
		if n.Grouped != nil {
			o.Grouped = *n.Grouped
		}
		if got, err := ToHex(n.Input, o); err != nil || got != n.Hex {
			t.Errorf("ToHex(%q, %+v) = %q, %v; want %q", n.Input, o, got, err, n.Hex)
		}
	}
}

func TestSignedVectors(t *testing.T) {
	v := load(t)
	for _, s := range v.Signed {
		o := DefaultOptions
		o.Prefix = s.Prefix
		o.Lower = s.Case == "lower"
		payload, _ := hex.DecodeString(s.PayloadHex)
		if got, err := SignKey(payload, []byte(s.Secret), s.TagBytes, o); err != nil || got != s.Key {
			t.Errorf("SignKey(%s) = %q, %v; want %q", s.PayloadHex, got, err, s.Key)
		}
		if got, err := VerifyKey(s.Key, []byte(s.Secret), s.TagBytes, o); err != nil || !bytes.Equal(got, payload) {
			t.Errorf("VerifyKey(%s) = %x, %v", s.Key, got, err)
		}
	}
	for _, s := range v.InvalidSigned {
		var e *Error
		if _, err := VerifyKey(s.Key, []byte(s.Secret), s.TagBytes, DefaultOptions); !errors.As(err, &e) || e.Code != s.Code {
			t.Errorf("VerifyKey(%s) error = %v", s.Key, err)
		}
	}
}

func TestSignErrors(t *testing.T) {
	secret := []byte("s")
	for _, n := range []int{3, 33} {
		if _, err := SignKey(nil, secret, n, DefaultOptions); err == nil {
			t.Errorf("tagBytes %d accepted", n)
		}
		if _, err := VerifyKey("22222", secret, n, DefaultOptions); err == nil {
			t.Errorf("verify tagBytes %d accepted", n)
		}
	}
	if _, err := SignKey(nil, nil, 0, DefaultOptions); err == nil {
		t.Error("empty secret accepted")
	}
	key, _ := SignKey([]byte{1, 2}, secret, 0, DefaultOptions)
	if _, err := VerifyKey(key, nil, 0, DefaultOptions); err == nil {
		t.Error("empty secret accepted on verify")
	}
	if _, err := VerifyKey("222ET-3ZZGX", secret, 0, DefaultOptions); err == nil {
		t.Error("typo accepted")
	}
	short, _ := FromBytes([]byte{1}, true, DefaultOptions)
	var e *Error
	if _, err := VerifyKey(short, secret, 0, DefaultOptions); !errors.As(err, &e) || e.Code != InvalidSignature {
		t.Errorf("short key: %v", err)
	}
	if _, err := FromHex("ab", Options{Grouped: true, Checked: true, Prefix: "L-C"}); err == nil {
		t.Error("bad prefix accepted")
	}
	if _, err := ToHex("ab", Options{Grouped: true, Checked: true, Prefix: "L-C"}); err == nil {
		t.Error("bad prefix accepted on decode")
	}
	if got := splitKey("  ", Options{Grouped: true, Checked: true, Normalize: true}); len(got) != 1 || got[0] != "" {
		t.Errorf("empty normalized split: %q", got)
	}
}

type zeroReader struct{}

func (zeroReader) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = 0
	}
	return len(p), nil
}

type failReader struct{}

func (failReader) Read(p []byte) (int, error) { return 0, errors.New("no randomness") }

func TestGenerateKey(t *testing.T) {
	key, err := GenerateKey(GenerateOptions{Options: DefaultOptions})
	if err != nil || len(key) != 23 || !Validate(key, DefaultOptions).Valid {
		t.Errorf("GenerateKey() = %q, %v", key, err)
	}
	o := Options{Grouped: true, Checked: true, Lower: true, Prefix: "LC"}
	if key, _ := GenerateKey(GenerateOptions{Options: o, Groups: 1, Random: zeroReader{}}); key != "LC-aaaaa" {
		t.Errorf("zero key = %q", key)
	}
	if key, _ := GenerateKey(GenerateOptions{Options: Options{Checked: true}, Groups: 1, Random: zeroReader{}}); key != "22222" {
		t.Errorf("ungrouped zero key = %q", key)
	}
	calls := 0
	if _, err := GenerateKey(GenerateOptions{Options: DefaultOptions, Filter: func(string) bool { calls++; return calls > 2 }}); err != nil || calls != 3 {
		t.Errorf("filter: %v after %d calls", err, calls)
	}
	var e *Error
	if _, err := GenerateKey(GenerateOptions{Options: DefaultOptions, MaxAttempts: 2, Filter: func(string) bool { return false }}); !errors.As(err, &e) || e.Code != GenerationFailed {
		t.Errorf("rejecting filter: %v", err)
	}
	if _, err := GenerateKey(GenerateOptions{Options: DefaultOptions, Groups: -1}); err == nil {
		t.Error("negative groups accepted")
	}
	if _, err := GenerateKey(GenerateOptions{Options: Options{Prefix: "a b"}}); err == nil {
		t.Error("bad prefix accepted")
	}
	if _, err := GenerateKey(GenerateOptions{Options: DefaultOptions, Random: failReader{}}); err == nil {
		t.Error("random error ignored")
	}
}
