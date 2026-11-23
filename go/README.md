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
// "222AF-22222-223CQ-C3JCL-3HCR4", the same key signKey makes in Node.js
payload, err := base32key.VerifyKey(signed, []byte("s3cret"), 0, base32key.DefaultOptions)
// payload == []byte{0, 0, 1, 42}; a wrong secret gives an *Error with code INVALID_SIGNATURE
```

The third argument is the tag length in bytes (4 to 32, 0 means 5).

### Options

Start from `DefaultOptions` (grouped, checked, uppercase) and change what you need:

- `Grouped`, `Checked`, `Lower`: the key format.
- `Prefix`: letters and digits put in front, e.g. `LC-222ET-3ZZGN`. Decoding requires it and returns `INVALID_PREFIX` otherwise.
- `Normalize` (decoding only): ignore spaces and hyphens and fold the case, so `"lc 222et 3zzgn"` with `Prefix: "LC"` decodes.

`FromBytes` and `ToBytes` take a `withLength` flag like the npm package. Typo suggestions and the CLI are only in the npm package for now.

Run the tests with `go test ./...` from this folder.
