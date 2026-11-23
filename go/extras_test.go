package base32key

import (
	"bytes"
	"errors"
	"reflect"
	"testing"
)

func TestGroupCountVectors(t *testing.T) {
	for _, v := range load(t).GroupCount {
		o := DefaultOptions
		o.Groups = v.Groups
		got := Validate(v.Key, o)
		want := Result{Valid: v.Valid, InvalidGroups: v.InvalidGroups, Code: v.Code}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("Validate(%q, Groups %d) = %+v, want %+v", v.Key, v.Groups, got, want)
		}
	}
}

func TestAutoCaseVectors(t *testing.T) {
	o := DefaultOptions
	o.AutoCase = true
	for _, v := range load(t).AutoCase {
		got, err := ToHex(v.Key, o)
		if v.Hex != "" {
			if err != nil || got != v.Hex {
				t.Errorf("ToHex(%q) = %q, %v, want %q", v.Key, got, err, v.Hex)
			}
			continue
		}
		var e *Error
		if !errors.As(err, &e) || e.Code != v.Code || !reflect.DeepEqual(e.InvalidGroups, v.InvalidGroups) {
			t.Errorf("ToHex(%q) error = %v, want %s %v", v.Key, err, v.Code, v.InvalidGroups)
		}
	}
}

func TestFormattedVectors(t *testing.T) {
	for _, v := range load(t).Formatted {
		if got := FormatInput(v.Input, v.Options.options()); got != v.Output {
			t.Errorf("FormatInput(%q, %+v) = %q, want %q", v.Input, v.Options, got, v.Output)
		}
	}
}

func TestSuggestionVectors(t *testing.T) {
	for _, v := range load(t).Suggestions {
		got := Suggest(v.Input, v.Options.options(), v.Options.Limit)
		if len(got) == 0 && len(v.Suggestions) == 0 {
			continue
		}
		if !reflect.DeepEqual(got, v.Suggestions) {
			t.Errorf("Suggest(%q, %+v) = %q, want %q", v.Input, v.Options, got, v.Suggestions)
		}
	}
}

func TestGroupsErrors(t *testing.T) {
	o := DefaultOptions
	o.Groups = 2
	_, err := ToHex("222ET", o)
	var e *Error
	if !errors.As(err, &e) || e.Code != InvalidLength || e.Message != "Invalid key: expected 2 groups, got 1" || !reflect.DeepEqual(e.InvalidGroups, []int{1}) {
		t.Errorf("ToHex error = %#v", err)
	}
	if h, err := ToHex("222ET-3ZZGN", o); err != nil || h != "c0ffee" {
		t.Errorf("ToHex = %q, %v", h, err)
	}
	o.Groups = -1
	if _, err := ToHex("222ET", o); err == nil {
		t.Error("negative Groups accepted")
	}
	o = Options{Checked: true, Groups: 1}
	if _, err := ToHex("222ET", o); err == nil {
		t.Error("Groups without Grouped accepted")
	}
	if !Validate("2222", Options{Groups: 3}).Valid {
		t.Error("Validate should ignore Groups for ungrouped keys")
	}
}

func TestAutoCaseElsewhere(t *testing.T) {
	lower := DefaultOptions
	lower.Lower = true
	key, _ := SignKey([]byte{0, 42}, []byte("s3cret"), 0, lower)
	auto := DefaultOptions
	auto.AutoCase = true
	if p, err := VerifyKey(key, []byte("s3cret"), 0, auto); err != nil || !bytes.Equal(p, []byte{0, 42}) {
		t.Errorf("VerifyKey = %x, %v", p, err)
	}
}

func TestToBytesLength(t *testing.T) {
	o := DefaultOptions
	got, err := ToBytesLength("222ET-3ZZGN", 5, o)
	if err != nil || !bytes.Equal(got, []byte{0, 0, 0xc0, 0xff, 0xee}) {
		t.Errorf("ToBytesLength = %x, %v", got, err)
	}
	zero, _ := FromHex("0", o)
	if got, err := ToBytesLength(zero, 0, o); err != nil || len(got) != 0 {
		t.Errorf("zero key = %x, %v", got, err)
	}
	var e *Error
	if _, err := ToBytesLength("222ET-3ZZGN", 2, o); !errors.As(err, &e) || e.Code != InvalidLength {
		t.Errorf("short length error = %v", err)
	}
	if _, err := ToBytesLength("222ET-3ZZGN", -1, o); err == nil {
		t.Error("negative length accepted")
	}
	if _, err := ToBytesLength("222ET-3ZZGX", 4, o); !errors.As(err, &e) || e.Code != ChecksumMismatch {
		t.Errorf("bad key error = %v", err)
	}
}

func TestSuggestEdges(t *testing.T) {
	o := DefaultOptions
	if got := Suggest("222et-3zzng", o, 0); !reflect.DeepEqual(got, []string{"222ET-3ZZGN"}) {
		t.Errorf("normalized Suggest = %q", got)
	}
	o.Prefix = "LC"
	if got := Suggest("XX-222TE-3ZZGN", o, 0); got != nil {
		t.Errorf("wrong prefix Suggest = %q", got)
	}
	o.Prefix = ""
	o.Groups = 2
	if got := Suggest("222TE", o, 0); got != nil {
		t.Errorf("missing group Suggest = %q", got)
	}
	if got := FormatInput("lc", Options{Grouped: true, Checked: true, Prefix: "LC"}); got != "LC" {
		t.Errorf("FormatInput prefix = %q", got)
	}
	if got := FormatInput("x222et", Options{Grouped: true, Checked: true, Prefix: "LC"}); got != "LC-X222E-T" {
		t.Errorf("FormatInput without prefix = %q", got)
	}
}
