package main

import (
	"encoding/csv"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"

	base32key "github.com/ducminhquan/base32-key/go"
)

const secretEnv = "BASE32_KEY_SECRET"

type assignments []string

func (a *assignments) String() string     { return strings.Join(*a, " ") }
func (a *assignments) Set(v string) error { *a = append(*a, v); return nil }

func presetNames() string {
	names := make([]string, 0, len(base32key.Presets))
	for name := range base32key.Presets {
		names = append(names, name)
	}
	sort.Strings(names)
	return strings.Join(names, ", ")
}

func loadTemplate(file, preset, prefix string, prefixSet bool) (*base32key.KeyTemplate, error) {
	var d base32key.TemplateDefinition
	switch {
	case file != "" && preset != "":
		return nil, usageError{"use -template or -preset, not both"}
	case file != "":
		raw, err := os.ReadFile(file)
		if err != nil {
			return nil, err
		}
		if err := json.Unmarshal(raw, &d); err != nil {
			return nil, fmt.Errorf("%s: %w", file, err)
		}
	case preset != "":
		presetFn, ok := base32key.Presets[preset]
		if !ok {
			return nil, usageError{"-preset must be " + presetNames()}
		}
		d = presetFn()
	default:
		return nil, usageError{"sign and verify need -template or -preset"}
	}
	if prefixSet {
		d.Prefix = prefix
	}
	return base32key.NewKeyTemplate(d)
}

// parseValues turns -set name=value into typed values for the fields.
func parseValues(t *base32key.KeyTemplate, list []string) (map[string]any, error) {
	values := map[string]any{}
	for _, a := range list {
		name, raw, ok := strings.Cut(a, "=")
		if !ok || name == "" {
			return nil, usageError{"-set takes name=value, got " + a}
		}
		var field *base32key.TemplateField
		for i := range t.Definition.Fields {
			if t.Definition.Fields[i].Name == name {
				field = &t.Definition.Fields[i]
			}
		}
		if field == nil {
			return nil, usageError{"unknown field " + name}
		}
		var value any = raw
		switch field.Type {
		case "uint":
			if n, err := strconv.ParseUint(raw, 10, 64); err == nil {
				value = n
			}
		case "bool":
			if raw == "true" || raw == "false" {
				value = raw == "true"
			}
		}
		values[name] = value
	}
	return values, nil
}

func plainValue(v any) any {
	if d, ok := v.(time.Time); ok {
		return d.Format("2006-01-02")
	}
	return v
}

func (c cli) runTemplate(command string, args []string) int {
	fs := flag.NewFlagSet("base32key "+command, flag.ContinueOnError)
	fs.SetOutput(c.stderr)
	file := fs.String("template", "", "key template definition (JSON file)")
	preset := fs.String("preset", "", "a ready-made template: "+presetNames())
	prefix := fs.String("prefix", "", "override the template's prefix")
	asJSON := fs.Bool("json", false, "print one JSON object per key")
	var set assignments
	var count, serialFrom *int
	var serialField, today *string
	var asCSV *bool
	if command == "sign" {
		fs.Var(&set, "set", "a field value name=value (repeat for each field)")
		count = fs.Int("count", 1, "number of keys")
		serialFrom = fs.Int("serial-from", -1, "number the keys from n in -serial-field")
		serialField = fs.String("serial-field", "serial", "field that -serial-from fills")
		asCSV = fs.Bool("csv", false, "print CSV with a header: key and fields")
	} else {
		today = fs.String("today", "", "date for the expiry check, YYYY-MM-DD (default: UTC today)")
	}
	if err := fs.Parse(args); err != nil {
		if errors.Is(err, flag.ErrHelp) {
			return 0
		}
		return 2
	}
	prefixSet := false
	fs.Visit(func(f *flag.Flag) { prefixSet = prefixSet || f.Name == "prefix" })
	t, err := loadTemplate(*file, *preset, *prefix, prefixSet)
	if err != nil {
		return c.usageFail(err)
	}
	secret := c.getenv(secretEnv)
	if secret == "" {
		return c.usageFail(usageError{"set the signing secret in the " + secretEnv + " environment variable"})
	}
	if command == "sign" {
		return c.sign(t, []byte(secret), set, *count, *serialFrom, *serialField, *asCSV, *asJSON)
	}
	o := base32key.TemplateVerifyOptions{}
	if *today != "" {
		if o.Today, err = time.Parse("2006-01-02", *today); err != nil {
			return c.usageFail(usageError{`-today must be a date "YYYY-MM-DD", got ` + *today})
		}
	}
	keys, err := c.values(fs.Args())
	if err != nil {
		return c.usageFail(err)
	}
	failed := false
	for _, key := range keys {
		values, err := t.Verify(key, []byte(secret), o)
		if err != nil {
			failed = true
			var e *base32key.Error
			errors.As(err, &e) // Verify only fails with *Error once the secret is set
			if *asJSON {
				b, _ := json.Marshal(map[string]any{"input": key, "error": err.Error(), "code": e.Code})
				fmt.Fprintln(c.stdout, string(b))
			} else {
				fmt.Fprintf(c.stderr, "%s: %v\n", key, err)
			}
			continue
		}
		plain := map[string]any{}
		parts := []string{}
		for _, f := range t.Definition.Fields {
			plain[f.Name] = plainValue(values[f.Name])
			parts = append(parts, fmt.Sprintf("%s=%v", f.Name, plain[f.Name]))
		}
		if *asJSON {
			b, _ := json.Marshal(map[string]any{"input": key, "values": plain})
			fmt.Fprintln(c.stdout, string(b))
		} else {
			fmt.Fprintf(c.stdout, "%s: valid %s\n", key, strings.Join(parts, " "))
		}
	}
	if failed {
		return 1
	}
	return 0
}

func (c cli) sign(t *base32key.KeyTemplate, secret []byte, set []string, count, serialFrom int, serialField string, asCSV, asJSON bool) int {
	base, err := parseValues(t, set)
	if err != nil {
		return c.usageFail(err)
	}
	if count < 1 {
		return c.usageFail(usageError{"-count must be positive"})
	}
	if count > 1 && serialFrom < 0 {
		return c.usageFail(usageError{"-count needs -serial-from, so that every key is different"})
	}
	w := csv.NewWriter(c.stdout)
	fields := []string{}
	for _, f := range t.Definition.Fields {
		fields = append(fields, f.Name)
	}
	if asCSV {
		w.Write(append([]string{"key"}, fields...))
	}
	for i := 0; i < count; i++ {
		values := map[string]any{}
		for k, v := range base {
			values[k] = v
		}
		if serialFrom >= 0 {
			values[serialField] = uint64(serialFrom + i)
		}
		key, err := t.Sign(values, secret)
		if err != nil {
			w.Flush()
			return c.usageFail(err)
		}
		switch {
		case asCSV:
			row := []string{key}
			for _, f := range fields {
				row = append(row, fmt.Sprint(plainValue(values[f])))
			}
			w.Write(row)
		case asJSON:
			b, _ := json.Marshal(map[string]any{"key": key, "values": values})
			fmt.Fprintln(c.stdout, string(b))
		default:
			fmt.Fprintln(c.stdout, key)
		}
	}
	w.Flush()
	return 0
}
