import json
import pathlib
import unittest

from base32_key import (Base32KeyError, from_bytes, from_hex, to_bytes, to_hex,
                        validate)

VECTORS = json.loads(
    (pathlib.Path(__file__).resolve().parents[2] / "test-vectors.json").read_text()
)
MODES = {
    "grouped": dict(grouped=True, checked=True),
    "ungrouped": dict(grouped=False, checked=True),
    "groupedUnchecked": dict(grouped=True, checked=False),
    "ungroupedUnchecked": dict(grouped=False, checked=False),
}


class VectorTest(unittest.TestCase):
    def test_valid(self):
        for v in VECTORS["valid"]:
            for case in ("upper", "lower"):
                for mode, opts in MODES.items():
                    key = v[case][mode]
                    with self.subTest(hex=v["hex"], case=case, mode=mode):
                        self.assertEqual(from_hex(v["hex"], case=case, **opts), key)
                        self.assertEqual(to_hex(key, case=case, **opts), v["hex"])
                        self.assertEqual(validate(key, case=case, **opts), (True, [], None))

    def test_invalid(self):
        for v in VECTORS["invalid"]:
            with self.subTest(key=v["key"]):
                with self.assertRaises(Base32KeyError) as ctx:
                    to_hex(v["key"])
                self.assertEqual(ctx.exception.code, v["code"])
                self.assertEqual(ctx.exception.invalid_groups, v["invalidGroups"])
                self.assertEqual(validate(v["key"]), (False, v["invalidGroups"], v["code"]))

    def test_bytes(self):
        for v in VECTORS["bytes"]:
            data = bytes.fromhex(v["hex"])
            with self.subTest(hex=v["hex"]):
                self.assertEqual(from_bytes(data, with_length=True), v["withLength"])
                self.assertEqual(to_bytes(v["withLength"], with_length=True), data)


class ApiTest(unittest.TestCase):
    def test_hex_prefix_and_errors(self):
        self.assertEqual(from_hex("0xC0FFEE"), "222ET-3ZZGN")
        for bad in ("", "0x", "xyz"):
            with self.assertRaises(Base32KeyError) as ctx:
                from_hex(bad)
            self.assertEqual(ctx.exception.code, "INVALID_HEX")
        with self.assertRaises(TypeError):
            from_hex(None)
        with self.assertRaises(TypeError):
            to_hex(None)
        with self.assertRaises(ValueError):
            from_hex("ab", case="title")

    def test_zero_round_trips(self):
        for opts in MODES.values():
            for case in ("upper", "lower"):
                self.assertEqual(to_hex(from_hex("0", case=case, **opts), case=case, **opts), "0")

    def test_bytes_options(self):
        self.assertEqual(to_bytes("222ET-3ZZGN"), b"\xc0\xff\xee")
        self.assertEqual(to_bytes("222ET-3ZZGN", length=4), b"\x00\xc0\xff\xee")
        self.assertEqual(to_bytes(from_hex("0"), length=0), b"")
        with self.assertRaises(Base32KeyError):
            to_bytes("222ET-3ZZGN", length=2)
        with self.assertRaises(ValueError):
            to_bytes("222ET-3ZZGN", length=-1)
        with self.assertRaises(ValueError):
            from_bytes(b"")
        with self.assertRaises(TypeError):
            from_bytes(b"a", with_length=True, grouped=False)
        with self.assertRaises(TypeError):
            to_bytes("22222", with_length=True, grouped=False)
        key = from_bytes(b"\x00\x01\x02", with_length=True)
        with self.assertRaises(Base32KeyError) as ctx:
            to_bytes(key.rsplit("-", 1)[0], with_length=True)
        self.assertEqual(ctx.exception.code, "INVALID_LENGTH")


if __name__ == "__main__":
    unittest.main()
