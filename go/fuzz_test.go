package base32key

import (
	"bytes"
	"encoding/hex"
	"strings"
	"testing"
)

// fuzzOptions turns a byte into one of the key formats.
func fuzzOptions(flags byte) Options {
	return Options{
		Grouped:   flags&1 != 0,
		Checked:   flags&2 != 0,
		Lower:     flags&4 != 0,
		Normalize: flags&8 != 0,
		AutoCase:  flags&16 != 0,
	}
}

func FuzzBytesRoundTrip(f *testing.F) {
	f.Add([]byte{0xc0, 0xff, 0xee}, byte(3))
	f.Add([]byte{0, 0, 1}, byte(7))
	f.Add([]byte{0xff}, byte(0))
	f.Fuzz(func(t *testing.T, data []byte, flags byte) {
		if len(data) == 0 || len(data) > 256 {
			return
		}
		o := fuzzOptions(flags)
		o.AutoCase = false
		key, err := FromBytes(data, false, o)
		if err != nil {
			t.Fatalf("FromBytes(%x): %v", data, err)
		}
		h, err := ToHex(key, o)
		if err != nil {
			t.Fatalf("ToHex(%q): %v", key, err)
		}
		want := strings.TrimLeft(hex.EncodeToString(data), "0")
		if want == "" {
			want = "0"
		}
		if h != want {
			t.Fatalf("ToHex(%q) = %q, want %q", key, h, want)
		}
		if !Validate(key, o).Valid {
			t.Fatalf("Validate(%q) invalid", key)
		}
		if got, err := ToBytesLength(key, len(data), o); err != nil || !bytes.Equal(got, data) {
			t.Fatalf("ToBytesLength(%q) = %x, %v, want %x", key, got, err, data)
		}
		if !o.Grouped {
			return
		}
		key, err = FromBytes(data, true, o)
		if err != nil {
			t.Fatalf("FromBytes(%x, withLength): %v", data, err)
		}
		got, err := ToBytes(key, true, o)
		if err != nil || !bytes.Equal(got, data) {
			t.Fatalf("ToBytes(%q, withLength) = %x, %v, want %x", key, got, err, data)
		}
	})
}

func FuzzDecode(f *testing.F) {
	for _, s := range []string{"222ET-3ZZGN", "222TE-3ZZGN", "aaan3-b99qw", " 222et 3zzgn ", "LC-222ET", "0O1I", "-", ""} {
		f.Add(s, byte(3), "")
	}
	f.Add("LC-222ET-3ZZGN", byte(11), "LC")
	f.Fuzz(func(t *testing.T, key string, flags byte, prefix string) {
		if len(key) > 200 || !prefixPattern.MatchString(prefix) || len(prefix) > 8 {
			return
		}
		o := fuzzOptions(flags)
		o.Prefix = prefix
		if o.Grouped && flags&32 != 0 {
			o.Groups = int(flags>>6) + 1
		}
		res := Validate(key, o)
		_, err := ToHex(key, o)
		if res.Valid != (err == nil) {
			t.Fatalf("Validate(%q).Valid = %v but ToHex error = %v", key, res.Valid, err)
		}
		if res.Valid && len(res.InvalidGroups) != 0 {
			t.Fatalf("valid key %q lists invalid groups %v", key, res.InvalidGroups)
		}
		if !res.Valid && res.Code == "" {
			t.Fatalf("invalid key %q has no code", key)
		}

		// Formatting is stable and keeps a valid key valid.
		formatted := FormatInput(key, o)
		if again := FormatInput(formatted, o); again != formatted {
			t.Fatalf("FormatInput not idempotent: %q -> %q -> %q", key, formatted, again)
		}

		// Every suggestion is a valid key, and a valid key gets none.
		suggestions := Suggest(key, o, 0)
		if len(suggestions) > 5 {
			t.Fatalf("Suggest(%q) returned %d keys", key, len(suggestions))
		}
		normalized := o
		normalized.Normalize = true
		if Validate(key, normalized).Valid && suggestions != nil {
			t.Fatalf("Suggest(%q) = %q for a valid key", key, suggestions)
		}
		for _, s := range suggestions {
			if !Validate(s, normalized).Valid {
				t.Fatalf("Suggest(%q) gave invalid %q", key, s)
			}
		}
	})
}
