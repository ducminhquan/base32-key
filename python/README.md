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

key = sign_key(b"\x00\x00\x01\x2a", "s3cret")   # '222AF-22222-223CQ-C3JCL-3HCR4'
verify_key(key, "s3cret")              # b'\x00\x00\x01*'
verify_key(key, "wrong")               # raises Base32KeyError, code 'INVALID_SIGNATURE'
```

Signed keys are the same as `signKey` in the npm package, so a key signed in Node.js verifies in Python and the other way round. `tag_bytes` (4 to 32, default 5) sets the tag length.

### Options

All options are keyword arguments, with the same defaults as the npm package:

- `grouped`, `checked`, `case` (`"upper"` or `"lower"`): the key format.
- `prefix`: letters and digits put in front, e.g. `from_hex("c0ffee", prefix="LC")` gives `'LC-222ET-3ZZGN'`. Decoding requires it and raises `INVALID_PREFIX` otherwise.
- `normalize` (decoding only): ignore spaces and hyphens and fold the case, so `to_hex("lc 222et 3zzgn", prefix="LC", normalize=True)` gives `'c0ffee'`.

Typo suggestions, `case="auto"` and the CLI are only in the npm package for now.

Run the tests from this folder with `python -m unittest discover -s tests -t .` after `pip install -e .`, or with `PYTHONPATH=src`.
