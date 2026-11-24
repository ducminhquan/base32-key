# base32-key for Go

A Go port of [base32-key](https://github.com/ducminhquan/base32-key): the same alphabets, the same check digit per group and the same keys, tested against the shared [test-vectors.json](https://github.com/ducminhquan/base32-key/blob/master/test-vectors.json).

```sh
go get github.com/ducminhquan/base32-key/go@latest
```

```go
import base32key "github.com/ducminhquan/base32-key/go"

key, _ := base32key.FromHex("c0ffee", base32key.DefaultOptions) // "222ET-3ZZGN"
hex, err := base32key.ToHex("222ET-3ZZGX", base32key.DefaultOptions)
var e *base32key.Error
if errors.As(err, &e) {
	fmt.Println(e.Code, e.InvalidGroups) // CHECKSUM_MISMATCH [1]
}
```

### Random and signed keys

```go
key, _ := base32key.GenerateKey(base32key.GenerateOptions{Options: base32key.DefaultOptions})
// e.g. "K7RQX-2HMTD-9WCJA-PNE4F" (80 random bits); also Groups, Filter, MaxAttempts

signed, _ := base32key.SignKey([]byte{0, 0, 1, 42}, []byte("s3cret"), 0, base32key.DefaultOptions)
// "222BA-22222-22BCC-8255N-DK73S", the same key signKey makes in Node.js
payload, err := base32key.VerifyKey(signed, []byte("s3cret"), 0, base32key.DefaultOptions)
// payload == []byte{0, 0, 1, 42}; a wrong secret gives an *Error with code INVALID_SIGNATURE
```

The third argument is the tag length in bytes (4 to 32, 0 means 5).

### Key templates: vouchers, activation codes, order numbers

A key template packs typed fields into a signed key, so a voucher carries its campaign, expiry date and amount and a shop can check it offline. The definitions (also as JSON, with `ParseKeyTemplate`), layout and keys are the same as `base32-key/template` in the npm package (see [SPEC.md](https://github.com/ducminhquan/base32-key/blob/master/SPEC.md#key-templates)).

```go
d := base32key.VoucherPreset() // also ActivationPreset, MemberPreset
d.Prefix = "LC"
voucher, _ := base32key.NewKeyTemplate(d)
key, _ := voucher.Sign(map[string]any{
	"campaign": 12, "expires": "2026-12-31", "amount": 50000, "serial": 1,
}, []byte("s3cret"))
// "LC-262EC-39Y2M-2EJ2F-22A2W-Q352U-DURHQ"
values, err := voucher.Verify(key, []byte("s3cret"), base32key.TemplateVerifyOptions{})
// values["amount"] == uint64(50000), values["expires"] is a time.Time
```

Fields are `uint` (`Bits`, optional `Unit`), `date` (a `time.Time` or `"YYYY-MM-DD"`), `enum` (`Values`) and `bool`. `Verify` returns an `*Error` with `INVALID_SIGNATURE` for a forged key, `UNKNOWN_TEMPLATE` for a key of another template and `EXPIRED` after the `Expires` field's date (set `Today` to the local date where the key is redeemed). `Encrypt: true` scrambles the fields, and with `TagBytes` pointing to 0 gives short order numbers that do not reveal how many orders there are. `VerifyKeyTemplates` checks a key against several templates.

### Options

Start from `DefaultOptions` (grouped, checked, uppercase) and change what you need:

- `Grouped`, `Checked`, `Lower`: the key format.
- `Prefix`: letters and digits put in front, e.g. `LC-222ET-3ZZGN`. Decoding requires it and returns `INVALID_PREFIX` otherwise.
- `Normalize` (decoding only): ignore spaces and hyphens and fold the case, so `"lc 222et 3zzgn"` with `Prefix: "LC"` decodes.
- `AutoCase` (decoding only): try both alphabets and keep the one whose check digits match.
- `Groups` (decoding only): the key must have exactly that many groups; otherwise `INVALID_LENGTH`, with the missing or extra groups in `InvalidGroups`.

`FromBytes` and `ToBytes` take a `withLength` flag like the npm package, and `ToBytesLength` decodes to a fixed number of bytes.

### Input fields

```go
base32key.FormatInput("222et3zz", base32key.DefaultOptions) // "222ET-3ZZ", while the user types
base32key.Suggest("222TE-3ZZGN", base32key.DefaultOptions, 0) // ["222ET-3ZZGN"], up to 5
```

`Suggest` repairs only the invalid groups, by swapping two neighbouring characters or replacing a look-alike (2/Z, 5/S, 8/B, U/V/Y, 0/O/D/Q, 1/I/L/J), and gives the same suggestions as the npm package.

### Command line

```sh
go install github.com/ducminhquan/base32-key/go/cmd/base32key@latest
base32key encode c0ffee                  # 222ET-3ZZGN
base32key decode -normalize "222et 3zzgn"
base32key validate -groups 4 -json K7RQX-2HMTD-9WCJA-PNE4F
base32key generate -count 5

export BASE32_KEY_SECRET=...             # sign and verify read the secret from here
base32key sign -preset voucher -set campaign=12 -set expires=2026-12-31 \
  -set amount=50000 -serial-from 1 -count 1000 -csv > vouchers.csv
base32key verify -preset voucher 262EC-39Y2M-2EJ2F-22A2W-Q352U-DURHQ
```

The commands match the npm CLI; flags go before the values, which are read from standard input when none are given.

Run the tests with `go test ./...` from this folder.
