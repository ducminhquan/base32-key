package main

import (
	"bytes"
	"encoding/json"
	"strings"
	"testing"
)

func run(stdin string, term bool, args ...string) (int, string, string) {
	var out, errOut bytes.Buffer
	c := cli{stdin: strings.NewReader(stdin), stdinIsTerm: term, stdout: &out, stderr: &errOut}
	code := c.run(args)
	return code, out.String(), errOut.String()
}

func TestEncodeDecode(t *testing.T) {
	if code, out, _ := run("", true, "encode", "c0ffee"); code != 0 || out != "222ET-3ZZGN\n" {
		t.Errorf("encode = %d %q", code, out)
	}
	if _, out, _ := run("", true, "encode", "-lower", "c0ffee"); out != "aaan3-b99qw\n" {
		t.Errorf("encode -lower = %q", out)
	}
	if _, out, _ := run("", true, "decode", "-case", "auto", "-upper-hex", "aaan3-b99qw"); out != "C0FFEE\n" {
		t.Errorf("decode auto = %q", out)
	}
	if _, out, _ := run("222et 3zzgn\n\n", false, "decode", "-normalize"); out != "c0ffee\n" {
		t.Errorf("decode stdin = %q", out)
	}
	code, _, errOut := run("", true, "decode", "222ET-3ZZGX")
	if code != 1 || !strings.Contains(errOut, "group 2") {
		t.Errorf("decode bad = %d %q", code, errOut)
	}
}

func TestJSON(t *testing.T) {
	code, out, _ := run("", true, "decode", "-json", "222ET-3ZZGN", "222ET-3ZZGX")
	lines := strings.Split(strings.TrimSpace(out), "\n")
	var first, second map[string]any
	json.Unmarshal([]byte(lines[0]), &first)
	json.Unmarshal([]byte(lines[1]), &second)
	if code != 1 || first["hex"] != "c0ffee" || second["code"] != "CHECKSUM_MISMATCH" {
		t.Errorf("json = %d %q", code, out)
	}
	if code, out, _ := run("", true, "encode", "-json", "zz"); code != 1 || !strings.Contains(out, "INVALID_HEX") {
		t.Errorf("encode json = %d %q", code, out)
	}
}

func TestValidate(t *testing.T) {
	if code, out, _ := run("", true, "validate", "222et3zzgn"); code != 0 || out != "222et3zzgn: valid\n" {
		t.Errorf("validate = %d %q", code, out)
	}
	if code, out, _ := run("", true, "validate", "-strict", "222et3zzgn"); code != 1 || !strings.Contains(out, "invalid (INVALID_CHARACTER) in group 1") {
		t.Errorf("validate strict = %d %q", code, out)
	}
	if _, out, _ := run("", true, "validate", "-groups", "2", "222ET"); out != "222ET: invalid (INVALID_LENGTH) in group 2\n" {
		t.Errorf("validate groups = %q", out)
	}
	if _, out, _ := run("", true, "validate", "-groups", "3", "222ET"); !strings.Contains(out, "in groups 2, 3") {
		t.Errorf("validate groups plural = %q", out)
	}
	if _, out, _ := run("", true, "validate", "-json", "222ET-3ZZGX"); !strings.Contains(out, `"invalidGroups":[1]`) {
		t.Errorf("validate json = %q", out)
	}
}

func TestGenerate(t *testing.T) {
	code, out, _ := run("", true, "generate", "-count", "3", "-groups", "2")
	keys := strings.Fields(out)
	if code != 0 || len(keys) != 3 || len(keys[0]) != 11 {
		t.Errorf("generate = %d %q", code, out)
	}
	if code, _, _ := run("", true, "generate", "-case", "auto"); code != 2 {
		t.Errorf("generate auto = %d", code)
	}
	if code, _, _ := run("", true, "generate", "-count", "0"); code != 2 {
		t.Errorf("generate count 0 = %d", code)
	}
	if code, _, _ := run("", true, "generate", "-prefix", "x"); code != 2 {
		t.Errorf("unknown flag = %d", code)
	}
}

func TestUsage(t *testing.T) {
	cases := []struct {
		args []string
		code int
	}{
		{nil, 2},
		{[]string{"bogus"}, 2},
		{[]string{"help"}, 0},
		{[]string{"version"}, 0},
		{[]string{"decode", "-h"}, 0},
		{[]string{"decode"}, 2},
		{[]string{"decode", "-case", "title", "x"}, 2},
	}
	for _, c := range cases {
		if code, _, _ := run("", true, c.args...); code != c.code {
			t.Errorf("%q = %d, want %d", c.args, code, c.code)
		}
	}
}
