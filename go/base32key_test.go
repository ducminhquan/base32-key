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
