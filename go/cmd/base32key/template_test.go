package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func runEnv(secret, stdin string, args ...string) (int, string, string) {
	var out, errOut bytes.Buffer
	c := cli{stdin: strings.NewReader(stdin), stdinIsTerm: stdin == "", stdout: &out, stderr: &errOut,
		getenv: func(name string) string {
			if name == secretEnv {
				return secret
			}
			return ""
		}}
	code := c.run(args)
	return code, out.String(), errOut.String()
}

const lcKey = "LC-262EC-39Y2M-2EJ2F-22A2W-Q352U-DURHQ"

var set = []string{"sign", "-preset", "voucher", "-set", "campaign=12", "-set", "expires=2026-12-31", "-set", "amount=50000"}

func TestSign(t *testing.T) {
	args := append(append([]string{}, set...), "-prefix", "LC", "-set", "serial=1")
	if code, out, err := runEnv("s3cret", "", args...); code != 0 || out != lcKey+"\n" {
		t.Errorf("sign = %d %q %q", code, out, err)
	}
	args = append(append([]string{}, set...), "-serial-from", "1", "-count", "3", "-csv")
	_, out, _ := runEnv("s3cret", "", args...)
	want := "key,campaign,expires,amount,serial\n" +
		"262EC-39Y2M-2EJ2F-22A2W-Q352U-DURHQ,12,2026-12-31,50000,1\n" +
		"262EC-39Y2M-2EJ2F-22J2X-WSEZZ-SZ2BD,12,2026-12-31,50000,2\n" +
		"262EC-39Y2M-2EJ2F-22S23-EQST9-CCSB8,12,2026-12-31,50000,3\n"
	if out != want {
		t.Errorf("sign -csv = %q", out)
	}
	_, out, _ = runEnv("s3cret", "", "sign", "-json", "-preset", "member", "-set", "member=1", "-set", "tier=gold")
	var data map[string]any
	if json.Unmarshal([]byte(out), &data); data["key"] != "2E22J-22237-J222Y-33A52-BKEFN" {
		t.Errorf("sign -json = %q", out)
	}
}

func TestTemplateFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "t.json")
	os.WriteFile(path, []byte(`{"id":5,"fields":[{"name":"on","type":"bool"},{"name":"n","type":"uint","bits":8}]}`), 0o600)
	code, out, _ := runEnv("s", "", "sign", "-template", path, "-set", "on=true", "-set", "n=3", "-csv")
	lines := strings.Split(strings.TrimSpace(out), "\n")
	if code != 0 || len(lines) != 2 || !strings.HasSuffix(lines[1], ",true,3") {
		t.Fatalf("sign = %d %q", code, out)
	}
	key := strings.Split(lines[1], ",")[0]
	if _, out, _ := runEnv("s", key+"\n", "verify", "-template", path); out != key+": valid on=true n=3\n" {
		t.Errorf("verify = %q", out)
	}
	if code, _, _ := runEnv("s", "", "sign", "-template", path, "-set", "on=yes", "-set", "n=x"); code != 2 {
		t.Errorf("bad values: %d", code)
	}
	bad := filepath.Join(t.TempDir(), "bad.json")
	os.WriteFile(bad, []byte("{"), 0o600)
	if code, _, _ := runEnv("s", "", "sign", "-template", bad); code != 2 {
		t.Errorf("bad JSON: %d", code)
	}
}

func TestVerify(t *testing.T) {
	code, out, _ := runEnv("s3cret", "", "verify", "-preset", "voucher", "-prefix", "LC", "-today", "2026-01-01", lcKey)
	if code != 0 || out != lcKey+": valid campaign=12 expires=2026-12-31 amount=50000 serial=1\n" {
		t.Errorf("verify = %d %q", code, out)
	}
	code, out, _ = runEnv("s3cret", "", "verify", "-json", "-preset", "voucher", "-prefix", "LC", "-today", "2027-01-01", lcKey)
	if code != 1 || !strings.Contains(out, `"code":"EXPIRED"`) {
		t.Errorf("expired = %d %q", code, out)
	}
	code, _, errOut := runEnv("wrong", "", "verify", "-preset", "voucher", "-prefix", "LC", lcKey)
	if code != 1 || !strings.Contains(errOut, "signature") {
		t.Errorf("wrong secret = %d %q", code, errOut)
	}
	if code, _, _ := runEnv("s", "", "verify", "-h"); code != 0 {
		t.Errorf("-h = %d", code)
	}
}

func TestTemplateUsage(t *testing.T) {
	for _, c := range []struct {
		secret string
		args   []string
	}{
		{"s", []string{"sign", "-set", "campaign=1"}},
		{"s", []string{"sign", "-preset", "voucher", "-template", "x.json"}},
		{"s", []string{"sign", "-preset", "coupon"}},
		{"s", []string{"sign", "-template", "/nonexistent.json"}},
		{"s", []string{"sign", "-preset", "voucher", "-prefix", "a-b"}},
		{"", set},
		{"s", []string{"sign", "-preset", "voucher", "-set", "nope"}},
		{"s", []string{"sign", "-preset", "voucher", "-set", "color=red"}},
		{"s", append(append([]string{}, set...), "-count", "2")},
		{"s", append(append([]string{}, set...), "-count", "0")},
		{"s", set}, // missing serial
		{"s", []string{"sign", "-bogus"}},
		{"s", []string{"verify", "-preset", "voucher", "-today", "soon", lcKey}},
		{"s", []string{"verify", "-preset", "voucher"}},
	} {
		if code, _, errOut := runEnv(c.secret, "", c.args...); code != 2 || errOut == "" {
			t.Errorf("%v = %d %q", c.args, code, errOut)
		}
	}
}
