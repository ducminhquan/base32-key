# base32-key for Python

A Python port of the core of [base32-key](https://github.com/ducminhquan/base32-key): the same alphabets, the same check digit per group and the same keys. It is tested against the shared [test-vectors.json](../test-vectors.json), so keys made in JavaScript decode here and the other way round.

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

Keyword options are `grouped`, `checked` and `case` (`"upper"` or `"lower"`), with the same defaults as the npm package. Input normalisation, prefixes, typo suggestions and signed keys are only in the JavaScript package for now.

Run the tests from this folder with `python -m unittest discover -s tests -t .` after `pip install -e .`, or with `PYTHONPATH=src`.
