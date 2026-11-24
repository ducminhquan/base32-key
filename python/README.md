# base32-key for Python

A Python port of [base32-key](https://github.com/ducminhquan/base32-key): the same alphabets, the same check digit per group and the same keys. It is tested against the shared [test-vectors.json](https://github.com/ducminhquan/base32-key/blob/master/test-vectors.json), so keys made in JavaScript decode here and the other way round.

```sh
pip install base32-key
```

Python 3.9 or later, no dependencies.

```python
from base32_key import from_hex, to_hex, from_bytes, to_bytes, validate, Base32KeyError

from_hex("c0ffee")                     # '222ET-3ZZGN'
to_hex("222ET-3ZZGN")                  # 'c0ffee'
from_hex("c0ffee", grouped=False, case="lower")  # 'nb99qj'
from_bytes(b"\x00\xff", with_length=True)        # '2224C-229ZN'
validate("222ET-3ZZGX")                # (False, [1], 'CHECKSUM_MISMATCH')

try:
    to_hex("222ET-3ZZGX")
except Base32KeyError as e:
    print(e.code, e.invalid_groups)    # CHECKSUM_MISMATCH [1]
```

### Random and signed keys

```python
from base32_key import generate_key, sign_key, verify_key

generate_key()                         # e.g. 'K7RQX-2HMTD-9WCJA-PNE4F' (80 random bits)
generate_key(groups=3, prefix="LC", filter=lambda k: k not in used)

key = sign_key(b"\x00\x00\x01\x2a", "s3cret")   # '222BA-22222-22BCC-8255N-DK73S'
verify_key(key, "s3cret")              # b'\x00\x00\x01*'
verify_key(key, "wrong")               # raises Base32KeyError, code 'INVALID_SIGNATURE'
```

Signed keys are the same as `signKey` in the npm package, so a key signed in Node.js verifies in Python and the other way round. `tag_bytes` (4 to 32, default 5) sets the tag length.

### Key templates: vouchers, activation codes, order numbers

A key template packs typed fields into a signed key, so a voucher carries its campaign, expiry date and amount and a shop can check it offline. The definitions, layout and keys are the same as `base32-key/template` in the npm package (see [SPEC.md](https://github.com/ducminhquan/base32-key/blob/master/SPEC.md#key-templates)).

```python
from base32_key.template import define_key_template, presets, verify_key_templates

voucher = define_key_template(presets.voucher(prefix="LC"))
key = voucher.sign({"campaign": 12, "expires": "2026-12-31",
                    "amount": 50000, "serial": 1}, "s3cret")
# 'LC-262EC-39Y2M-2EJ2F-22A2W-Q352U-DURHQ'
voucher.verify(key, "s3cret")
# {'campaign': 12, 'expires': datetime.date(2026, 12, 31), 'amount': 50000, 'serial': 1}

# Order numbers that do not reveal how many orders there are: encrypted, no tag.
order = define_key_template({"id": 9, "fields": [{"name": "order", "type": "uint", "bits": 40}],
                             "encrypt": True, "tagBytes": 0, "prefix": "DH"})
order.sign({"order": 12345}, "s3cret")  # 'DH-TPV5H-CLKPF-GL6QP'
```

Fields are `uint` (`bits`, optional `unit`), `date` (`"YYYY-MM-DD"` or a `datetime.date`), `enum` (`values`) and `bool`. `verify` raises `Base32KeyError` with `INVALID_SIGNATURE` for a forged key, `UNKNOWN_TEMPLATE` for a key of another template and `EXPIRED` after the `expires` field's date (pass `today=` for the local date where the key is redeemed). `verify_key_templates` checks a key against several templates and returns `(template, values)`. The presets are `voucher`, `activation` and `member`, and take overrides such as `encrypt=True` or `tag_bytes=8`.

### Options

All options are keyword arguments, with the same defaults as the npm package:

- `grouped`, `checked`, `case` (`"upper"` or `"lower"`; decoding also takes `"auto"`, which tries both): the key format.
- `prefix`: letters and digits put in front, e.g. `from_hex("c0ffee", prefix="LC")` gives `'LC-222ET-3ZZGN'`. Decoding requires it and raises `INVALID_PREFIX` otherwise.
- `normalize` (decoding only): ignore spaces and hyphens and fold the case, so `to_hex("lc 222et 3zzgn", prefix="LC", normalize=True)` gives `'c0ffee'`.

- `groups` (decoding): the key must have exactly that many groups, e.g. `validate("222ET", groups=4)` gives `(False, [1, 2, 3], 'INVALID_LENGTH')`.
- `length` (`to_bytes`): left-pad the result with zero bytes to that size.

### Input fields

```python
from base32_key import format_input, suggest

format_input("222et3zz")               # '222ET-3ZZ', while the user types
format_input("222et3zzgn22", groups=2) # '222ET-3ZZGN'
suggest("222TE-3ZZGN")                 # ['222ET-3ZZGN'], for "Did you mean ...?"
```

`suggest` repairs only the invalid groups, by swapping two neighbouring characters or replacing a look-alike (2/Z, 5/S, 8/B, U/V/Y, 0/O/D/Q, 1/I/L/J), and gives the same suggestions as the npm package.

### Command line

```sh
base32-key encode c0ffee               # 222ET-3ZZGN (or: python -m base32_key ...)
base32-key decode --normalize "222et 3zzgn"
base32-key validate --groups 4 --json K7RQX-2HMTD-9WCJA-PNE4F
base32-key generate --count 5
base32-key encode --file data.bin      # bytes with their length

export BASE32_KEY_SECRET=...           # sign and verify read the secret from here
base32-key sign --preset voucher --set campaign=12 --set expires=2026-12-31 \
  --set amount=50000 --serial-from 1 --count 1000 --csv > vouchers.csv
base32-key verify --preset voucher 262EC-39Y2M-2EJ2F-22A2W-Q352U-DURHQ
```

The commands and flags are the same as the npm CLI; values are read from standard input when none are given.

Run the tests from this folder with `python -m unittest discover -s tests -t .` after `pip install -e .`, or with `PYTHONPATH=src`.
