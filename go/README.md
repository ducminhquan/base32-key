# base32-key for Go

A Go port of the core of [base32-key](https://github.com/ducminhquan/base32-key): the same alphabets, the same check digit per group and the same keys, tested against the shared [test-vectors.json](https://github.com/ducminhquan/base32-key/blob/master/test-vectors.json).

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

`Options` has `Grouped`, `Checked` and `Lower`. Start from `DefaultOptions` (grouped, checked, uppercase). `FromBytes` and `ToBytes` take a `withLength` flag like the npm package.

Run the tests with `go test ./...` from this folder.
