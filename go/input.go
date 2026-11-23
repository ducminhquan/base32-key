package base32key

import "strings"

// FormatInput formats raw user input as a key: it drops whitespace, applies
// the letter case and puts hyphens between groups. Partial input is fine,
// and characters outside the alphabet are kept so Validate can flag them.
// With o.Groups, input beyond that many groups is dropped. AutoCase formats
// as uppercase. The same as formatInput in the npm package.
func FormatInput(raw string, o Options) string {
	o.Normalize = true
	if o.AutoCase {
		o.Lower = false
	}
	rest := raw
	if p := o.Prefix; p != "" {
		cleaned := strings.ToUpper(separators.ReplaceAllString(raw, ""))
		if strings.HasPrefix(strings.ToUpper(p), cleaned) {
			return cleaned // still typing the prefix
		}
		if stripped, ok := stripPrefix(raw, o); ok {
			rest = stripped
		}
	}
	groups := splitKey(rest, o)
	if o.Groups > 0 && o.Grouped && len(groups) > o.Groups {
		groups = groups[:o.Groups]
	}
	sep := ""
	if o.Grouped {
		sep = "-"
	}
	return addPrefix(strings.Join(groups, sep), o.Prefix)
}

// lookalikes maps a character to what it may have been meant as. Same
// table as the npm package.
var lookalikes = map[rune]string{
	'2': "Zz", 'Z': "2", '5': "Ss", 'S': "5", '8': "B", 'B': "8",
	'6': "Gb", 'G': "6C", 'C': "G", 'U': "VY", 'V': "UY", 'Y': "VU",
	'M': "N", 'N': "M", '0': "DQdq", 'O': "DQ", '1': "LJ7ij", 'I': "LJ",
	'z': "2", 's': "5", 'b': "6", 'g': "9q", 'q': "g9", '9': "gq",
	'u': "vy", 'v': "uy", 'y': "vu", 'm': "n", 'n': "m", 'o': "dq",
	'l': "ij7", 'i': "j", 'j': "i",
}

func groupCandidates(group, alphabet string) []string {
	var out []string
	seen := map[string]bool{group: true}
	add := func(c string) {
		if !seen[c] {
			seen[c] = true
			out = append(out, c)
		}
	}
	r := []rune(group)
	// Two neighbouring characters typed in the wrong order.
	for i := 0; i+1 < len(r); i++ {
		s := append([]rune{}, r...)
		s[i], s[i+1] = s[i+1], s[i]
		add(string(s))
	}
	// A character misread as a look-alike.
	for i, ch := range r {
		for _, c := range lookalikes[ch] {
			if strings.ContainsRune(alphabet, c) {
				s := append([]rune{}, r...)
				s[i] = c
				add(string(s))
			}
		}
	}
	return out
}

// Suggest returns up to limit (0 means 5) valid keys close to a mistyped
// one, for a "Did you mean" hint. Each invalid group is repaired by
// swapping two neighbouring characters or replacing a look-alike (2/Z, 5/S,
// 8/B, U/V/Y, 0/O/D/Q …). Input is always normalized. It returns nil for a
// valid key or when nothing close is found, and gives the same suggestions
// as suggest in the npm package.
func Suggest(key string, o Options, limit int) []string {
	if limit <= 0 {
		limit = 5
	}
	o.Normalize = true
	cases := []bool{o.Lower}
	if o.AutoCase {
		cases = []bool{false, true}
	}
	o.AutoCase = false
	var results []string
	for _, lower := range cases {
		opts := o
		opts.Lower = lower
		res := Validate(key, opts)
		if res.Valid {
			return nil
		}
		if res.Code == InvalidPrefix {
			continue
		}
		head := ""
		if o.Prefix != "" {
			head = o.Prefix + "-"
		}
		formatOpts := opts
		formatOpts.Groups = 0
		body := strings.TrimPrefix(FormatInput(key, formatOpts), head)
		parts := []string{body}
		if o.Grouped {
			parts = strings.Split(body, "-")
		}
		single := Options{Grouped: o.Grouped, Checked: o.Checked, Lower: lower}
		choices := make([][]string, 0, len(res.InvalidGroups))
		ok := true
		for _, index := range res.InvalidGroups {
			if index >= len(parts) {
				ok = false
				break
			}
			var valid []string
			for _, c := range groupCandidates(parts[index], single.alphabet()) {
				if Validate(c, single).Valid {
					valid = append(valid, c)
				}
			}
			if len(valid) == 0 {
				ok = false
				break
			}
			choices = append(choices, valid)
		}
		if !ok {
			continue
		}
		sep := ""
		if o.Grouped {
			sep = "-"
		}
		var combine func(depth int, picked []string)
		combine = func(depth int, picked []string) {
			if len(results) >= limit {
				return
			}
			if depth == len(choices) {
				fixed := append([]string{}, parts...)
				for k, index := range res.InvalidGroups {
					fixed[index] = picked[k]
				}
				results = append(results, head+strings.Join(fixed, sep))
				return
			}
			for _, c := range choices[depth] {
				combine(depth+1, append(append([]string{}, picked...), c))
			}
		}
		combine(0, nil)
	}
	return results
}
