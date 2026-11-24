// Command base32key encodes, decodes, validates and generates Base32 keys,
// with the same commands as the npm package's CLI.
//
//	go install github.com/ducminhquan/base32-key/go/cmd/base32key@latest
//	base32key encode c0ffee          # 222ET-3ZZGN
//	base32key decode -normalize "222et 3zzgn"
//	base32key validate -groups 4 K7RQX-2HMTD-9WCJA-PNE4F
//	base32key generate -count 5
//	BASE32_KEY_SECRET=... base32key sign -preset voucher -set campaign=12 \
//	  -set expires=2026-12-31 -set amount=50000 -serial-from 1 -count 1000 -csv
//
// Values are read from standard input, one per line, when none are given.
// Flags go before the values.
package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	base32key "github.com/ducminhquan/base32-key/go"
)

const usage = `Usage: base32key <command> [flags] [values...]

Commands:
  encode <hex...>     Encode hex strings as keys
  decode <key...>     Decode keys to hex strings
  validate <key...>   Check keys; exit code 1 if any is invalid
  generate            Generate random keys
  sign                Make keys from a key template (vouchers, ...)
  verify <key...>     Check template keys and print their values
  version             Print the library version

Values are read from standard input, one per line, when none are given.
sign and verify read the secret from the BASE32_KEY_SECRET environment variable.
Run "base32key <command> -h" for the flags of a command.`

type cli struct {
	stdin          io.Reader
	stdinIsTerm    bool
	stdout, stderr io.Writer
	getenv         func(string) string
}

func main() {
	info, err := os.Stdin.Stat()
	term := err == nil && info.Mode()&os.ModeCharDevice != 0
	c := cli{stdin: os.Stdin, stdinIsTerm: term, stdout: os.Stdout, stderr: os.Stderr, getenv: os.Getenv}
	os.Exit(c.run(os.Args[1:]))
}

type usageError struct{ msg string }

func (e usageError) Error() string { return e.msg }

func (c cli) values(given []string) ([]string, error) {
	if len(given) > 0 {
		return given, nil
	}
	if c.stdinIsTerm {
		return nil, usageError{"no values given"}
	}
	var out []string
	scanner := bufio.NewScanner(c.stdin)
	for scanner.Scan() {
		if line := strings.TrimSpace(scanner.Text()); line != "" {
			out = append(out, line)
		}
	}
	return out, scanner.Err()
}

func (c cli) run(args []string) int {
	if len(args) == 0 {
		fmt.Fprintln(c.stderr, usage)
		return 2
	}
	command, rest := args[0], args[1:]
	switch command {
	case "-h", "-help", "--help", "help":
		fmt.Fprintln(c.stdout, usage)
		return 0
	case "version", "-v", "--version":
		fmt.Fprintln(c.stdout, base32key.Version)
		return 0
	case "encode", "decode", "validate", "generate":
	case "sign", "verify":
		return c.runTemplate(command, rest)
	default:
		fmt.Fprintf(c.stderr, "unknown command %q\n\n%s\n", command, usage)
		return 2
	}

	fs := flag.NewFlagSet("base32key "+command, flag.ContinueOnError)
	fs.SetOutput(c.stderr)
	keyCase := fs.String("case", "upper", "alphabet: upper, lower, or auto when decoding")
	lower := fs.Bool("lower", false, "same as -case lower")
	ungrouped := fs.Bool("ungrouped", false, "keys are not split into groups")
	unchecked := fs.Bool("unchecked", false, "keys have no check digits")
	asJSON := fs.Bool("json", false, "print one JSON object per value")
	groupsHelp := "the key must have exactly n groups"
	if command == "generate" {
		groupsHelp = "groups per key (default 4)"
	}
	groups := fs.Int("groups", 0, groupsHelp)
	var normalize, strict, upperHex *bool
	var count *int
	switch command {
	case "decode":
		normalize = fs.Bool("normalize", false, "ignore whitespace, case and hyphen placement")
		upperHex = fs.Bool("upper-hex", false, "print uppercase hex")
	case "validate":
		strict = fs.Bool("strict", false, "check the key exactly as typed")
	case "generate":
		count = fs.Int("count", 1, "number of keys")
	}
	if err := fs.Parse(rest); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 2
	}

	o := base32key.Options{Grouped: !*ungrouped, Checked: !*unchecked}
	switch {
	case *keyCase == "auto":
		o.AutoCase = true
	case *keyCase == "lower" || *lower:
		o.Lower = true
	case *keyCase != "upper":
		return c.usageFail(usageError{"-case must be upper, lower or auto"})
	}
	if *groups < 0 || (count != nil && *count < 1) {
		return c.usageFail(usageError{"-groups and -count must be positive"})
	}
	if o.AutoCase && (command == "encode" || command == "generate") {
		return c.usageFail(usageError{"-case auto only applies when decoding"})
	}

	failed := false
	print := func(text string, data map[string]any) {
		if *asJSON {
			b, _ := json.Marshal(data)
			fmt.Fprintln(c.stdout, string(b))
		} else {
			fmt.Fprintln(c.stdout, text)
		}
	}
	each := func(fn func(string) (string, map[string]any, error)) int {
		values, err := c.values(fs.Args())
		if err != nil {
			return c.usageFail(err)
		}
		for _, v := range values {
			text, data, err := fn(v)
			if err != nil {
				failed = true
				code := any(nil)
				var e *base32key.Error
				if errors.As(err, &e) {
					code = e.Code
				}
				if *asJSON {
					b, _ := json.Marshal(map[string]any{"input": v, "error": err.Error(), "code": code})
					fmt.Fprintln(c.stdout, string(b))
				} else {
					fmt.Fprintf(c.stderr, "%s: %v\n", v, err)
				}
				continue
			}
			data["input"] = v
			print(text, data)
		}
		if failed {
			return 1
		}
		return 0
	}

	switch command {
	case "encode":
		return each(func(h string) (string, map[string]any, error) {
			key, err := base32key.FromHex(h, o)
			return key, map[string]any{"key": key}, err
		})
	case "decode":
		o.Normalize = *normalize
		o.Groups = *groups
		return each(func(key string) (string, map[string]any, error) {
			h, err := base32key.ToHex(key, o)
			if *upperHex {
				h = strings.ToUpper(h)
			}
			return h, map[string]any{"hex": h}, err
		})
	case "validate":
		o.Normalize = !*strict
		o.Groups = *groups
		return each(func(key string) (string, map[string]any, error) {
			res := base32key.Validate(key, o)
			data := map[string]any{"valid": res.Valid, "invalidGroups": res.InvalidGroups}
			if res.Valid {
				return key + ": valid", data, nil
			}
			failed = true
			data["code"] = res.Code
			parts := make([]string, len(res.InvalidGroups))
			for i, g := range res.InvalidGroups {
				parts[i] = strconv.Itoa(g + 1)
			}
			noun := "groups"
			if len(parts) == 1 {
				noun = "group"
			}
			return fmt.Sprintf("%s: invalid (%s) in %s %s", key, res.Code, noun, strings.Join(parts, ", ")), data, nil
		})
	default: // generate
		for i := 0; i < *count; i++ {
			key, err := base32key.GenerateKey(base32key.GenerateOptions{Options: o, Groups: *groups})
			if err != nil {
				fmt.Fprintln(c.stderr, err)
				return 1
			}
			print(key, map[string]any{"key": key})
		}
		return 0
	}
}

func (c cli) usageFail(err error) int {
	fmt.Fprintf(c.stderr, "base32key: %v\n", err)
	return 2
}
