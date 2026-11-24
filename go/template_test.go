package base32key

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"
)

type templateVectors struct {
	Templates []struct {
		Definition json.RawMessage `json:"definition"`
		Secret     string          `json:"secret"`
		Values     map[string]any  `json:"values"`
		Key        string          `json:"key"`
	} `json:"templates"`
	InvalidTemplates []struct {
		Definition json.RawMessage `json:"definition"`
		Secret     string          `json:"secret"`
		Key        string          `json:"key"`
		Today      string          `json:"today"`
		Code       string          `json:"code"`
	} `json:"invalidTemplates"`
}

func loadTemplateVectors(t *testing.T) templateVectors {
	raw, err := os.ReadFile("../test-vectors.json")
	if errors.Is(err, os.ErrNotExist) {
		t.Skip("../test-vectors.json not found; run the tests from a clone")
	}
	if err != nil {
		t.Fatal(err)
	}
	var v templateVectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatal(err)
	}
	return v
}

// plain turns verified values into the JSON forms of the vectors.
func plain(values map[string]any) map[string]any {
	out := map[string]any{}
	for k, v := range values {
		switch x := v.(type) {
		case time.Time:
			out[k] = x.Format("2006-01-02")
		case uint64:
			out[k] = float64(x)
		default:
			out[k] = v
		}
	}
	return out
}

func codeOf(err error) string {
	var e *Error
	if errors.As(err, &e) {
		return e.Code
	}
	return ""
}

func mustTemplate(t *testing.T, d TemplateDefinition) *KeyTemplate {
	t.Helper()
	tpl, err := NewKeyTemplate(d)
	if err != nil {
		t.Fatal(err)
	}
	return tpl
}

func day(s string) time.Time {
	d, _ := time.Parse("2006-01-02", s)
	return d
}

func TestTemplateVectors(t *testing.T) {
	v := loadTemplateVectors(t)
	for _, c := range v.Templates {
		tpl, err := ParseKeyTemplate(c.Definition)
		if err != nil {
			t.Fatal(err)
		}
		key, err := tpl.Sign(c.Values, []byte(c.Secret))
		if err != nil || key != c.Key {
			t.Errorf("Sign(%v) = %q, %v; want %q", c.Values, key, err, c.Key)
		}
		values, err := tpl.Verify(c.Key, []byte(c.Secret), TemplateVerifyOptions{Today: day("2020-01-01")})
		if err != nil || fmt.Sprint(plain(values)) != fmt.Sprint(c.Values) {
			t.Errorf("Verify(%q) = %v, %v; want %v", c.Key, values, err, c.Values)
		}
	}
	for _, c := range v.InvalidTemplates {
		tpl, err := ParseKeyTemplate(c.Definition)
		if err != nil {
			t.Fatal(err)
		}
		o := TemplateVerifyOptions{}
		if c.Today != "" {
			o.Today = day(c.Today)
		}
		if _, err := tpl.Verify(c.Key, []byte(c.Secret), o); codeOf(err) != c.Code {
			t.Errorf("Verify(%q) error %v, want %s", c.Key, err, c.Code)
		}
	}
}

var voucherValues = map[string]any{"campaign": 12, "expires": "2026-12-31", "amount": 50000, "serial": 1}

func lcVoucher(t *testing.T) *KeyTemplate {
	d := VoucherPreset()
	d.Prefix = "LC"
	return mustTemplate(t, d)
}

func TestTemplateRoundTrip(t *testing.T) {
	voucher := lcVoucher(t)
	values := map[string]any{"campaign": uint64(12), "expires": time.Date(2026, 12, 31, 23, 0, 0, 0, time.Local), "amount": int64(50000), "serial": uint32(1)}
	key, err := voucher.Sign(values, []byte("s3cret"))
	if err != nil || key != "LC-262EC-39Y2M-2EJ2F-22A2W-Q352U-DURHQ" || voucher.Groups != 6 {
		t.Fatalf("Sign = %q, %v", key, err)
	}
	typed := strings.ToLower(strings.ReplaceAll(key, "-", " "))
	got, err := voucher.Verify(typed, []byte("s3cret"), TemplateVerifyOptions{Today: day("2026-12-31")})
	if err != nil || got["expires"] != day("2026-12-31") || got["amount"] != uint64(50000) {
		t.Fatalf("Verify = %v, %v", got, err)
	}
	if _, err := voucher.Verify(typed, []byte("s3cret"), TemplateVerifyOptions{Strict: true}); codeOf(err) == "" {
		t.Error("Strict accepted a lowercase key with spaces")
	}
	if _, err := voucher.Verify(key, []byte("s3cret"), TemplateVerifyOptions{Today: day("2027-01-01")}); codeOf(err) != Expired {
		t.Errorf("expired key: %v", err)
	}
	if _, err := voucher.Verify(key, nil, TemplateVerifyOptions{}); err == nil {
		t.Error("empty secret accepted")
	}

	activation := mustTemplate(t, ActivationPreset())
	far, _ := activation.Sign(map[string]any{"product": 1, "expires": "2199-01-01", "serial": 2}, []byte("k"))
	if _, err := activation.Verify(far, []byte("k"), TemplateVerifyOptions{}); err != nil {
		t.Error(err)
	}
	old, _ := activation.Sign(map[string]any{"product": 1, "expires": "2020-01-02", "serial": 2}, []byte("k"))
	if _, err := activation.Verify(old, []byte("k"), TemplateVerifyOptions{}); codeOf(err) != Expired {
		t.Errorf("old key: %v", err)
	}
}

func TestTemplateEncryption(t *testing.T) {
	zero := 0
	order := mustTemplate(t, TemplateDefinition{ID: 9, Fields: []TemplateField{{Name: "order", Type: "uint", Bits: 40}}, Encrypt: true, TagBytes: &zero})
	firsts := map[string]bool{}
	for n := 0; n < 200; n++ {
		key, err := order.Sign(map[string]any{"order": n}, []byte("s"))
		if err != nil {
			t.Fatal(err)
		}
		firsts[key[:5]] = true
		got, err := order.Verify(key, []byte("s"), TemplateVerifyOptions{})
		if err != nil || got["order"] != uint64(n) {
			t.Fatalf("Verify(%q) = %v, %v", key, got, err)
		}
	}
	if len(firsts) < 150 {
		t.Errorf("only %d different first groups", len(firsts))
	}
	member := MemberPreset()
	eight := 8
	member.TagBytes, member.Encrypt = &eight, true
	tpl := mustTemplate(t, member)
	key, _ := tpl.Sign(map[string]any{"member": 42, "tier": "platinum"}, []byte("s"))
	got, err := tpl.Verify(key, []byte("s"), TemplateVerifyOptions{})
	if err != nil || tpl.Groups != 6 || got["tier"] != "platinum" {
		t.Errorf("member: %v, %v", got, err)
	}
}

func TestTemplateVerifyErrors(t *testing.T) {
	voucher := lcVoucher(t)
	for key, code := range map[string]string{"XX-262EC": InvalidPrefix, "LC-262EC": InvalidLength} {
		if _, err := voucher.Verify(key, []byte("s"), TemplateVerifyOptions{}); codeOf(err) != code {
			t.Errorf("Verify(%q): %v, want %s", key, err, code)
		}
	}
	enum := mustTemplate(t, TemplateDefinition{ID: 3, Fields: []TemplateField{{Name: "tier", Type: "enum", Values: []string{"a", "b", "c"}}}})
	raw := mustTemplate(t, TemplateDefinition{ID: 3, Fields: []TemplateField{{Name: "tier", Type: "uint", Bits: 2}}})
	key, _ := raw.Sign(map[string]any{"tier": 3}, []byte("s"))
	if _, err := enum.Verify(key, []byte("s"), TemplateVerifyOptions{}); codeOf(err) != UnknownTemplate {
		t.Errorf("enum out of range: %v", err)
	}
}

func TestVerifyKeyTemplates(t *testing.T) {
	voucher := lcVoucher(t)
	activation := ActivationPreset()
	activation.Prefix = "LC"
	templates := []*KeyTemplate{mustTemplate(t, MemberPreset()), mustTemplate(t, activation), voucher}
	key, _ := voucher.Sign(voucherValues, []byte("s3cret"))
	o := TemplateVerifyOptions{Today: day("2026-01-01")}
	tpl, values, err := VerifyKeyTemplates(templates, key, []byte("s3cret"), o)
	if err != nil || tpl != voucher || values["amount"] != uint64(50000) {
		t.Fatalf("VerifyKeyTemplates = %v, %v, %v", tpl, values, err)
	}
	if _, _, err := VerifyKeyTemplates(templates, key, []byte("wrong"), o); codeOf(err) != InvalidSignature {
		t.Errorf("wrong secret: %v", err)
	}
	if _, _, err := VerifyKeyTemplates(templates[:1], key, []byte("s3cret"), o); codeOf(err) != UnknownTemplate {
		t.Errorf("no template: %v", err)
	}
	if _, _, err := VerifyKeyTemplates(templates, key[:len(key)-1]+"!", []byte("s3cret"), o); codeOf(err) != InvalidCharacter {
		t.Errorf("bad character: %v", err)
	}
	if _, _, err := VerifyKeyTemplates(templates, key, nil, o); err == nil || codeOf(err) != "" {
		t.Errorf("empty secret: %v", err)
	}
}

func TestTemplateSignErrors(t *testing.T) {
	voucher := lcVoucher(t)
	with := func(name string, value any) map[string]any {
		out := map[string]any{}
		for k, v := range voucherValues {
			out[k] = v
		}
		if value == nil {
			delete(out, name)
		} else {
			out[name] = value
		}
		return out
	}
	for _, values := range []map[string]any{
		with("extra", 1), with("serial", nil), with("amount", 50001), with("amount", -1000),
		with("amount", true), with("amount", 1.5), with("amount", int32(-1)), with("amount", int64(-1)),
		with("amount", 70000000), with("expires", "2019-12-31"), with("expires", "2026-02-30"),
		with("expires", 5),
	} {
		if _, err := voucher.Sign(values, []byte("s")); err == nil {
			t.Errorf("Sign(%v) succeeded", values)
		}
	}
	if _, err := voucher.Sign(voucherValues, nil); err == nil {
		t.Error("empty secret accepted")
	}
	for _, values := range []map[string]any{
		{"campaign": uint(1), "expires": "2026-01-01", "amount": float64(1000), "serial": 0},
	} {
		if _, err := voucher.Sign(values, []byte("s")); err != nil {
			t.Error(err)
		}
	}
	flags := mustTemplate(t, TemplateDefinition{ID: 4, Fields: []TemplateField{
		{Name: "on", Type: "bool"}, {Name: "color", Type: "enum", Values: []string{"red", "blue"}}}})
	for _, values := range []map[string]any{{"on": 1, "color": "red"}, {"on": true, "color": "green"}} {
		if _, err := flags.Sign(values, []byte("s")); err == nil {
			t.Errorf("Sign(%v) succeeded", values)
		}
	}
	for _, on := range []bool{true, false} {
		key, _ := flags.Sign(map[string]any{"on": on, "color": "blue"}, []byte("s"))
		got, err := flags.Verify(key, []byte("s"), TemplateVerifyOptions{})
		if err != nil || got["on"] != on || got["color"] != "blue" {
			t.Errorf("flags: %v, %v", got, err)
		}
	}
}

func TestTemplateDefinitionErrors(t *testing.T) {
	n := []TemplateField{{Name: "n", Type: "uint", Bits: 8}}
	three, thirtyThree, zero := 3, 33, 0
	big := make([]TemplateField, 6)
	for i := range big {
		big[i] = TemplateField{Name: fmt.Sprintf("n%d", i), Type: "uint", Bits: 48}
	}
	for _, d := range []TemplateDefinition{
		{ID: 256, Fields: n},
		{ID: -1, Fields: n},
		{ID: 1, Fields: n, TagBytes: &zero},
		{ID: 1, Fields: n, TagBytes: &three},
		{ID: 1, Fields: n, TagBytes: &thirtyThree},
		{ID: 1, Fields: n, Case: "auto"},
		{ID: 1, Fields: n, Prefix: "a-b"},
		{ID: 1},
		{ID: 1, Fields: []TemplateField{{Name: "1n", Type: "uint", Bits: 8}}},
		{ID: 1, Fields: []TemplateField{{Name: "n", Type: "float"}}},
		{ID: 1, Fields: []TemplateField{{Name: "n", Type: "uint", Bits: 49}}},
		{ID: 1, Fields: []TemplateField{{Name: "n", Type: "uint", Bits: 8, Unit: 1 << 53}}},
		{ID: 1, Fields: []TemplateField{{Name: "n", Type: "date", Bits: 7}}},
		{ID: 1, Fields: []TemplateField{{Name: "n", Type: "enum", Values: []string{"a"}}}},
		{ID: 1, Fields: []TemplateField{{Name: "n", Type: "enum", Values: []string{"a", "a"}}}},
		{ID: 1, Fields: []TemplateField{{Name: "n", Type: "enum", Values: []string{"a", ""}}}},
		{ID: 1, Fields: []TemplateField{{Name: "n", Type: "bool"}, {Name: "n", Type: "bool"}}},
		{ID: 1, Fields: n, Expires: "n"},
		{ID: 1, Fields: big},
	} {
		if _, err := NewKeyTemplate(d); err == nil {
			t.Errorf("NewKeyTemplate(%+v) succeeded", d)
		}
	}
	if _, err := ParseKeyTemplate([]byte("{")); err == nil {
		t.Error("ParseKeyTemplate accepted bad JSON")
	}
	for name, preset := range Presets {
		if _, err := NewKeyTemplate(preset()); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}
