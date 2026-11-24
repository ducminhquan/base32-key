package base32key_test

import (
	"bytes"
	"errors"
	"fmt"

	base32key "github.com/ducminhquan/base32-key/go"
)

func ExampleFromHex() {
	key, _ := base32key.FromHex("c0ffee", base32key.DefaultOptions)
	fmt.Println(key)

	lower := base32key.DefaultOptions
	lower.Lower = true
	lower.Prefix = "LC"
	key, _ = base32key.FromHex("c0ffee", lower)
	fmt.Println(key)
	// Output:
	// 222ET-3ZZGN
	// LC-aaan3-b99qw
}

func ExampleToHex() {
	h, _ := base32key.ToHex("222ET-3ZZGN", base32key.DefaultOptions)
	fmt.Println(h)

	_, err := base32key.ToHex("222ET-3ZZGX", base32key.DefaultOptions)
	var e *base32key.Error
	if errors.As(err, &e) {
		fmt.Println(e.Code, e.InvalidGroups, e.Message)
	}
	// Output:
	// c0ffee
	// CHECKSUM_MISMATCH [1] Invalid key: group 2 has a check digit that does not match
}

func ExampleToHex_normalize() {
	o := base32key.DefaultOptions
	o.Normalize = true
	o.Prefix = "LC"
	h, _ := base32key.ToHex(" lc 222et 3zzgn ", o)
	fmt.Println(h)
	// Output: c0ffee
}

func ExampleValidate() {
	o := base32key.DefaultOptions
	o.Groups = 4
	fmt.Printf("%+v\n", base32key.Validate("222ET-3ZZGN", o))
	// Output: {Valid:false InvalidGroups:[2 3] Code:INVALID_LENGTH}
}

func ExampleFromBytes() {
	key, _ := base32key.FromBytes([]byte{0, 0xff}, true, base32key.DefaultOptions)
	fmt.Println(key)
	data, _ := base32key.ToBytes(key, true, base32key.DefaultOptions)
	fmt.Printf("%x\n", data)
	// Output:
	// 2224C-229ZN
	// 00ff
}

func ExampleFormatInput() {
	fmt.Println(base32key.FormatInput("222et3zz", base32key.DefaultOptions))
	o := base32key.DefaultOptions
	o.Groups = 2
	fmt.Println(base32key.FormatInput("222et3zzgn22", o))
	// Output:
	// 222ET-3ZZ
	// 222ET-3ZZGN
}

func ExampleSuggest() {
	fmt.Println(base32key.Suggest("222TE-3ZZGN", base32key.DefaultOptions, 0))
	// Output: [222ET-3ZZGN]
}

func ExampleGenerateKey() {
	// A fixed Random source makes the output reproducible; leave it nil
	// to use crypto/rand.
	key, _ := base32key.GenerateKey(base32key.GenerateOptions{
		Options: base32key.DefaultOptions,
		Groups:  2,
		Random:  bytes.NewReader(make([]byte, 8)),
	})
	fmt.Println(key)
	// Output: 22222-22222
}

func ExampleSignKey() {
	secret := []byte("s3cret")
	key, _ := base32key.SignKey([]byte{0, 0, 1, 42}, secret, 0, base32key.DefaultOptions)
	fmt.Println(key)

	payload, _ := base32key.VerifyKey(key, secret, 0, base32key.DefaultOptions)
	fmt.Println(payload)

	_, err := base32key.VerifyKey(key, []byte("wrong"), 0, base32key.DefaultOptions)
	fmt.Println(err)
	// Output:
	// 222BA-22222-22BCC-8255N-DK73S
	// [0 0 1 42]
	// Invalid key: the signature does not match
}
