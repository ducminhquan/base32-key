"""Property tests with Hypothesis (pip install hypothesis); skipped without it."""

import unittest

try:
    from hypothesis import given, settings, strategies as st
except ImportError:  # pragma: no cover
    raise unittest.SkipTest("hypothesis is not installed")

from base32_key import (format_input, from_bytes, from_hex, suggest, to_bytes, to_hex,
                        validate)

FORMATS = st.fixed_dictionaries({
    "grouped": st.booleans(),
    "checked": st.booleans(),
    "case": st.sampled_from(["upper", "lower"]),
})
# Key-like text: alphabet characters, look-alikes, separators and some noise.
KEYISH = st.text(
    alphabet=st.sampled_from(list("23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdeqwxyz01OIl- é")),
    max_size=40,
)
PROFILE = settings(max_examples=400, deadline=None)


class PropertyTest(unittest.TestCase):
    @PROFILE
    @given(st.binary(min_size=1, max_size=64), FORMATS)
    def test_bytes_round_trip(self, data, fmt):
        key = from_bytes(data, **fmt)
        self.assertEqual(to_hex(key, **fmt), data.hex().lstrip("0") or "0")
        self.assertEqual(validate(key, **fmt), (True, [], None))
        self.assertEqual(to_bytes(key, length=len(data), **fmt), data)
        if fmt["grouped"]:
            key = from_bytes(data, with_length=True, **fmt)
            self.assertEqual(to_bytes(key, with_length=True, **fmt), data)

    @PROFILE
    @given(st.from_regex(r"[0-9a-f]{1,40}", fullmatch=True), FORMATS)
    def test_hex_round_trip_and_normalize(self, h, fmt):
        key = from_hex(h, **fmt)
        messy = " " + key.swapcase().replace("-", " ") + " "
        self.assertEqual(to_hex(messy, normalize=True, **fmt), h.lstrip("0") or "0")

    @PROFILE
    @given(KEYISH, FORMATS, st.booleans(), st.sampled_from([None, 1, 2, 4]))
    def test_decode_never_crashes(self, key, fmt, normalize, groups):
        if groups and not fmt["grouped"]:
            groups = None
        valid, invalid, code = validate(key, normalize=normalize, groups=groups, **fmt)
        self.assertEqual(valid, code is None)
        self.assertEqual(valid, not invalid or code is None)
        try:
            to_hex(key, normalize=normalize, groups=groups, **fmt)
            self.assertTrue(valid)
        except ValueError:
            self.assertFalse(valid)

    @PROFILE
    @given(KEYISH, FORMATS, st.sampled_from([None, 1, 2, 4]))
    def test_format_and_suggest(self, key, fmt, groups):
        if groups and not fmt["grouped"]:
            groups = None
        formatted = format_input(key, groups=groups, **fmt)
        self.assertEqual(format_input(formatted, groups=groups, **fmt), formatted)
        suggestions = suggest(key, groups=groups, **fmt)
        self.assertLessEqual(len(suggestions), 5)
        if validate(key, normalize=True, groups=groups, **fmt)[0]:
            self.assertEqual(suggestions, [])
        for s in suggestions:
            self.assertTrue(validate(s, groups=groups, **fmt)[0], s)


if __name__ == "__main__":
    unittest.main()
